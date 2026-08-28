import {
  ActivityOutcome,
  Capability,
  EvidenceReviewStatus,
  Prisma,
  Role,
  SessionRevocationReason,
  StaffOperationalStatus,
  TransferStatus,
  UserStatus,
  type FundingInstructionTemplate
} from "../generated/prisma/client.js";
import type { AuthPrincipal } from "../auth/service.js";
import { hashPassword } from "../auth/password.js";
import { writeActivity } from "../auth/audit.js";
import type { HawellyPrismaClient } from "../db/prisma.js";
import { PublicApiError } from "../http/errors.js";
import type { RequestContext } from "../middleware/requestContext.js";
import type {
  activateConfigurationSchema,
  createFundingTemplateSchema,
  createStaffSchema,
  grantCapabilitySchema,
  updateFundingTemplateSchema,
  updateStaffSchema
} from "./validation.js";
import type { z } from "zod";

type CreateStaffInput = z.infer<typeof createStaffSchema>;
type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
type GrantCapabilityInput = z.infer<typeof grantCapabilitySchema>;
type ActivateConfigurationInput = z.infer<typeof activateConfigurationSchema>;
type CreateTemplateInput = z.infer<typeof createFundingTemplateSchema>;
type UpdateTemplateInput = z.infer<typeof updateFundingTemplateSchema>;

export interface EvidencePolicyCeiling {
  maximumProofBytes: number;
  allowedContentTypes: readonly string[];
}

function requireAdmin(principal: AuthPrincipal) {
  if (principal.role !== Role.ADMIN) {
    throw new PublicApiError(403, "FORBIDDEN", "Forbidden");
  }
}

function assertConfirmed(input: { confirmed: true; reason: string }) {
  if (input.confirmed !== true || input.reason.trim().length < 3) {
    throw new PublicApiError(400, "ADMIN_CONFIRMATION_REQUIRED", "Confirmation and a reason are required");
  }
}

function staffProjection(staff: {
  id: string;
  fullName: string;
  email: string;
  status: UserStatus;
  createdAt: Date;
  staffProfile: { operationalStatus: StaffOperationalStatus } | null;
  capabilityGrants: { capability: Capability }[];
}) {
  return {
    id: staff.id,
    fullName: staff.fullName,
    email: staff.email,
    status: staff.status,
    operationalStatus: staff.staffProfile?.operationalStatus ?? StaffOperationalStatus.INACTIVE,
    capabilities: staff.capabilityGrants.map((grant) => grant.capability).sort(),
    createdAt: staff.createdAt.toISOString()
  };
}

function configurationProjection(configuration: {
  id: string;
  version: number;
  active: boolean;
  quoteSlaMinutes: number;
  quoteDefaultExpiryMinutes: number;
  supportedOriginCountries: string[];
  supportedDestinationCountries: string[];
  supportedCurrencies: string[];
  payoutMethodsByDestination: Prisma.JsonValue;
  evidenceMaxSizeBytes: bigint;
  evidenceAllowedContentTypes: string[];
  transferLimitsByCurrency: Prisma.JsonValue | null;
  broadcastMessage: string | null;
  maintenanceMessage: string | null;
  reason: string;
  createdAt: Date;
}) {
  return {
    id: configuration.id,
    version: configuration.version,
    active: configuration.active,
    quoteSlaMinutes: configuration.quoteSlaMinutes,
    quoteDefaultExpiryMinutes: configuration.quoteDefaultExpiryMinutes,
    supportedOriginCountries: configuration.supportedOriginCountries,
    supportedDestinationCountries: configuration.supportedDestinationCountries,
    supportedCurrencies: configuration.supportedCurrencies,
    payoutMethodsByDestination: configuration.payoutMethodsByDestination,
    evidenceMaxSizeBytes: configuration.evidenceMaxSizeBytes.toString(),
    evidenceAllowedContentTypes: configuration.evidenceAllowedContentTypes,
    transferLimitsByCurrency: configuration.transferLimitsByCurrency,
    broadcastMessage: configuration.broadcastMessage,
    maintenanceMessage: configuration.maintenanceMessage,
    reason: configuration.reason,
    createdAt: configuration.createdAt.toISOString()
  };
}

function templateProjection(template: FundingInstructionTemplate) {
  return {
    id: template.id,
    name: template.name,
    method: template.method,
    currency: template.currency,
    payeeName: template.payeeName,
    provider: template.provider,
    accountReference: template.accountReference,
    instructions: template.instructions,
    active: template.active,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString()
  };
}

const staffInclude = {
  staffProfile: { select: { operationalStatus: true } },
  capabilityGrants: {
    where: { revokedAt: null },
    select: { capability: true }
  }
} satisfies Prisma.UserInclude;

export class AdminWorkflowService {
  constructor(
    private readonly database: HawellyPrismaClient,
    private readonly evidencePolicyCeiling: EvidencePolicyCeiling,
    private readonly clock: () => Date = () => new Date()
  ) {}

  async listStaff(principal: AuthPrincipal, limit: number) {
    requireAdmin(principal);
    const staff = await this.database.user.findMany({
      where: { role: Role.STAFF },
      include: staffInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit
    });
    return staff.map(staffProjection);
  }

  async createStaff(principal: AuthPrincipal, input: CreateStaffInput, context: RequestContext) {
    requireAdmin(principal);
    assertConfirmed(input);
    const now = this.clock();
    const passwordHash = await hashPassword(input.password);
    try {
      const staff = await this.database.$transaction(async (transaction) => {
        const created = await transaction.user.create({
          data: {
            fullName: input.fullName,
            email: input.email.trim().toLowerCase(),
            passwordHash,
            role: Role.STAFF,
            status: UserStatus.ACTIVE,
            passwordChangedAt: now,
            staffProfile: { create: { displayName: input.fullName, operationalStatus: StaffOperationalStatus.ACTIVE } }
          },
          include: staffInclude
        });
        await writeActivity(transaction, {
          actorUserId: principal.userId,
          actorRole: principal.role,
          source: context.source,
          requestId: context.requestId,
          actionType: "STAFF_CREATED",
          outcome: ActivityOutcome.SUCCESS,
          entityType: "User",
          entityId: created.id,
          nextState: { role: Role.STAFF, status: created.status, operationalStatus: created.staffProfile?.operationalStatus },
          reason: input.reason,
          metadata: {}
        });
        return created;
      });
      return staffProjection(staff);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new PublicApiError(409, "STAFF_NOT_CREATED", "Staff account could not be created");
      }
      throw error;
    }
  }

  private async lockStaff(transaction: Prisma.TransactionClient, staffId: string) {
    await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${staffId}::uuid FOR UPDATE`;
    const staff = await transaction.user.findFirst({ where: { id: staffId, role: Role.STAFF }, include: staffInclude });
    if (!staff) throw new PublicApiError(404, "STAFF_NOT_FOUND", "Staff account was not found");
    return staff;
  }

  private async invalidateStaffSessions(transaction: Prisma.TransactionClient, staffId: string, now: Date) {
    await transaction.user.update({ where: { id: staffId }, data: { sessionVersion: { increment: 1 } } });
    await transaction.authSession.updateMany({
      where: { userId: staffId, revokedAt: null },
      data: { revokedAt: now, revocationReason: SessionRevocationReason.ADMIN_REVOKED }
    });
  }

  async updateStaff(principal: AuthPrincipal, staffId: string, input: UpdateStaffInput, context: RequestContext) {
    requireAdmin(principal);
    assertConfirmed(input);
    const now = this.clock();
    const updated = await this.database.$transaction(async (transaction) => {
      const current = await this.lockStaff(transaction, staffId);
      const status = input.status ?? current.status;
      const operationalStatus = status === UserStatus.ACTIVE
        ? input.operationalStatus ?? current.staffProfile?.operationalStatus ?? StaffOperationalStatus.INACTIVE
        : StaffOperationalStatus.INACTIVE;
      await transaction.user.update({ where: { id: staffId }, data: { status } });
      await transaction.staffProfile.update({ where: { userId: staffId }, data: { operationalStatus } });
      await this.invalidateStaffSessions(transaction, staffId, now);
      await writeActivity(transaction, {
        actorUserId: principal.userId,
        actorRole: principal.role,
        source: context.source,
        requestId: context.requestId,
        actionType: "STAFF_ACCESS_CHANGED",
        outcome: ActivityOutcome.SUCCESS,
        entityType: "User",
        entityId: staffId,
        previousState: { status: current.status, operationalStatus: current.staffProfile?.operationalStatus },
        nextState: { status, operationalStatus },
        reason: input.reason,
        metadata: { sessionsInvalidated: true }
      });
      return transaction.user.findUniqueOrThrow({ where: { id: staffId }, include: staffInclude });
    });
    return staffProjection(updated);
  }

  async grantCapability(principal: AuthPrincipal, staffId: string, input: GrantCapabilityInput, context: RequestContext) {
    requireAdmin(principal);
    assertConfirmed(input);
    const now = this.clock();
    const staff = await this.database.$transaction(async (transaction) => {
      await this.lockStaff(transaction, staffId);
      const existing = await transaction.staffCapabilityGrant.findFirst({
        where: { staffUserId: staffId, capability: input.capability, revokedAt: null }
      });
      if (existing) throw new PublicApiError(409, "CAPABILITY_ALREADY_GRANTED", "Capability is already granted");
      await transaction.staffCapabilityGrant.create({
        data: {
          staffUserId: staffId,
          capability: input.capability,
          grantedByUserId: principal.userId,
          grantedAt: now,
          reason: input.reason
        }
      });
      await this.invalidateStaffSessions(transaction, staffId, now);
      await writeActivity(transaction, {
        actorUserId: principal.userId,
        actorRole: principal.role,
        source: context.source,
        requestId: context.requestId,
        actionType: "STAFF_CAPABILITY_GRANTED",
        outcome: ActivityOutcome.SUCCESS,
        entityType: "User",
        entityId: staffId,
        nextState: { capability: input.capability, active: true },
        reason: input.reason,
        metadata: { sessionsInvalidated: true }
      });
      return transaction.user.findUniqueOrThrow({ where: { id: staffId }, include: staffInclude });
    });
    return staffProjection(staff);
  }

  async revokeCapability(principal: AuthPrincipal, staffId: string, capability: Capability, reason: string, confirmed: true, context: RequestContext) {
    requireAdmin(principal);
    assertConfirmed({ reason, confirmed });
    const now = this.clock();
    const staff = await this.database.$transaction(async (transaction) => {
      await this.lockStaff(transaction, staffId);
      const revoked = await transaction.staffCapabilityGrant.updateMany({
        where: { staffUserId: staffId, capability, revokedAt: null },
        data: { revokedAt: now, revokedByUserId: principal.userId, reason }
      });
      if (revoked.count !== 1) throw new PublicApiError(404, "CAPABILITY_NOT_GRANTED", "Active capability grant was not found");
      await this.invalidateStaffSessions(transaction, staffId, now);
      await writeActivity(transaction, {
        actorUserId: principal.userId,
        actorRole: principal.role,
        source: context.source,
        requestId: context.requestId,
        actionType: "STAFF_CAPABILITY_REVOKED",
        outcome: ActivityOutcome.SUCCESS,
        entityType: "User",
        entityId: staffId,
        previousState: { capability, active: true },
        nextState: { capability, active: false },
        reason,
        metadata: { sessionsInvalidated: true }
      });
      return transaction.user.findUniqueOrThrow({ where: { id: staffId }, include: staffInclude });
    });
    return staffProjection(staff);
  }

  async getConfiguration(principal: AuthPrincipal) {
    requireAdmin(principal);
    const configuration = await this.database.adminConfiguration.findFirst({
      where: { active: true },
      orderBy: { version: "desc" }
    });
    return configuration ? configurationProjection(configuration) : null;
  }

  private validateConfiguration(input: ActivateConfigurationInput) {
    const unique = (values: readonly string[]) => new Set(values).size === values.length;
    if (![input.supportedOriginCountries, input.supportedDestinationCountries, input.supportedCurrencies, input.evidenceAllowedContentTypes].every(unique)) {
      throw new PublicApiError(400, "DUPLICATE_CONFIGURATION_VALUE", "Configuration lists must not contain duplicates");
    }
    const destinationSet = new Set(input.supportedDestinationCountries);
    const mappingKeys = Object.keys(input.payoutMethodsByDestination);
    if (mappingKeys.length !== destinationSet.size || mappingKeys.some((key) => !destinationSet.has(key))) {
      throw new PublicApiError(400, "INVALID_PAYOUT_METHOD_CONFIGURATION", "Every supported destination must have payout methods");
    }
    for (const methods of Object.values(input.payoutMethodsByDestination)) {
      if (new Set(methods).size !== methods.length) {
        throw new PublicApiError(400, "DUPLICATE_CONFIGURATION_VALUE", "Payout methods must not contain duplicates");
      }
    }
    const permittedContentTypes = new Set(this.evidencePolicyCeiling.allowedContentTypes);
    if (input.evidenceMaxSizeBytes > this.evidencePolicyCeiling.maximumProofBytes || input.evidenceAllowedContentTypes.some((type) => !permittedContentTypes.has(type))) {
      throw new PublicApiError(400, "EVIDENCE_POLICY_EXCEEDS_STORAGE_LIMIT", "Evidence policy cannot exceed the environment storage limits");
    }
    if (input.transferLimitsByCurrency && Object.keys(input.transferLimitsByCurrency).some((currency) => !input.supportedCurrencies.includes(currency))) {
      throw new PublicApiError(400, "INVALID_TRANSFER_LIMIT_CONFIGURATION", "Transfer limits require a supported currency");
    }
  }

  async activateConfiguration(principal: AuthPrincipal, input: ActivateConfigurationInput, context: RequestContext) {
    requireAdmin(principal);
    assertConfirmed(input);
    this.validateConfiguration(input);
    const configuration = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(782423891)`;
      const current = await transaction.adminConfiguration.findFirst({ where: { active: true }, orderBy: { version: "desc" } });
      const latest = await transaction.adminConfiguration.aggregate({ _max: { version: true } });
      if (current) await transaction.adminConfiguration.update({ where: { id: current.id }, data: { active: false } });
      const created = await transaction.adminConfiguration.create({
        data: {
          version: (latest._max.version ?? 0) + 1,
          active: true,
          quoteSlaMinutes: input.quoteSlaMinutes,
          quoteDefaultExpiryMinutes: input.quoteDefaultExpiryMinutes,
          supportedOriginCountries: input.supportedOriginCountries,
          supportedDestinationCountries: input.supportedDestinationCountries,
          supportedCurrencies: input.supportedCurrencies,
          payoutMethodsByDestination: input.payoutMethodsByDestination,
          evidenceMaxSizeBytes: BigInt(input.evidenceMaxSizeBytes),
          evidenceAllowedContentTypes: input.evidenceAllowedContentTypes,
          transferLimitsByCurrency: input.transferLimitsByCurrency ?? Prisma.JsonNull,
          broadcastMessage: input.broadcastMessage ?? null,
          maintenanceMessage: input.maintenanceMessage ?? null,
          createdByAdminId: principal.userId,
          reason: input.reason
        }
      });
      await writeActivity(transaction, {
        actorUserId: principal.userId,
        actorRole: principal.role,
        source: context.source,
        requestId: context.requestId,
        actionType: "ADMIN_CONFIGURATION_ACTIVATED",
        outcome: ActivityOutcome.SUCCESS,
        entityType: "AdminConfiguration",
        entityId: created.id,
        previousState: current ? { version: current.version, active: true } : null,
        nextState: { version: created.version, active: true },
        reason: input.reason,
        metadata: {}
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return configurationProjection(configuration);
  }

  async listFundingTemplates(principal: AuthPrincipal, limit: number) {
    requireAdmin(principal);
    const templates = await this.database.fundingInstructionTemplate.findMany({
      orderBy: [{ active: "desc" }, { currency: "asc" }, { name: "asc" }],
      take: limit
    });
    return templates.map(templateProjection);
  }

  async createFundingTemplate(principal: AuthPrincipal, input: CreateTemplateInput, context: RequestContext) {
    requireAdmin(principal);
    assertConfirmed(input);
    const template = await this.database.$transaction(async (transaction) => {
      const created = await transaction.fundingInstructionTemplate.create({
        data: {
          name: input.name,
          method: input.method,
          currency: input.currency,
          payeeName: input.payeeName,
          provider: input.provider ?? null,
          accountReference: input.accountReference ?? null,
          instructions: input.instructions,
          active: input.active ?? true,
          createdByStaffId: principal.userId
        }
      });
      await writeActivity(transaction, {
        actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId,
        actionType: "FUNDING_TEMPLATE_CREATED", outcome: ActivityOutcome.SUCCESS,
        entityType: "FundingInstructionTemplate", entityId: created.id,
        nextState: { method: created.method, currency: created.currency, active: created.active }, reason: input.reason, metadata: {}
      });
      return created;
    });
    return templateProjection(template);
  }

  async updateFundingTemplate(principal: AuthPrincipal, templateId: string, input: UpdateTemplateInput, context: RequestContext) {
    requireAdmin(principal);
    assertConfirmed(input);
    const template = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "FundingInstructionTemplate" WHERE "id" = ${templateId}::uuid FOR UPDATE`;
      const current = await transaction.fundingInstructionTemplate.findUnique({ where: { id: templateId } });
      if (!current) throw new PublicApiError(404, "FUNDING_TEMPLATE_NOT_FOUND", "Funding template was not found");
      const updated = await transaction.fundingInstructionTemplate.update({
        where: { id: templateId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.method !== undefined ? { method: input.method } : {}),
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
          ...(input.payeeName !== undefined ? { payeeName: input.payeeName } : {}),
          ...(input.provider !== undefined ? { provider: input.provider } : {}),
          ...(input.accountReference !== undefined ? { accountReference: input.accountReference } : {}),
          ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
          ...(input.active !== undefined ? { active: input.active } : {})
        }
      });
      await writeActivity(transaction, {
        actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId,
        actionType: "FUNDING_TEMPLATE_CHANGED", outcome: ActivityOutcome.SUCCESS,
        entityType: "FundingInstructionTemplate", entityId: updated.id,
        previousState: { method: current.method, currency: current.currency, active: current.active },
        nextState: { method: updated.method, currency: updated.currency, active: updated.active }, reason: input.reason, metadata: {}
      });
      return updated;
    });
    return templateProjection(template);
  }

  async listActivity(principal: AuthPrincipal, limit: number) {
    requireAdmin(principal);
    const events = await this.database.activityEvent.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit
    });
    return events.map((event) => ({
      id: event.id,
      actorUserId: event.actorUserId,
      actorRole: event.actorRole,
      source: event.source,
      requestId: event.requestId,
      actionType: event.actionType,
      outcome: event.outcome,
      entityType: event.entityType,
      entityId: event.entityId,
      previousState: event.previousState,
      nextState: event.nextState,
      reason: event.reason,
      errorCode: event.errorCode,
      metadata: event.metadata,
      createdAt: event.createdAt.toISOString()
    }));
  }

  async getDashboard(principal: AuthPrincipal) {
    requireAdmin(principal);
    const now = this.clock();
    const fundingCutoff = new Date(now.getTime() - 24 * 60 * 60_000);
    const [overdueQuotes, fundingAttention, overduePayouts, activeDisputes, pendingRefunds] = await Promise.all([
      this.database.transferRequest.findMany({
        where: { quoteDueAt: { lt: now }, status: { in: [TransferStatus.REQUESTED, TransferStatus.NEEDS_INFO, TransferStatus.QUOTING] } },
        select: { id: true, reference: true, status: true, quoteDueAt: true }, orderBy: { quoteDueAt: "asc" }, take: 25
      }),
      this.database.transferRequest.findMany({
        where: { status: { in: [TransferStatus.FUNDING_PENDING, TransferStatus.FUNDING_SUBMITTED] }, updatedAt: { lt: fundingCutoff } },
        select: { id: true, reference: true, status: true, updatedAt: true }, orderBy: { updatedAt: "asc" }, take: 25
      }),
      this.database.payoutCase.findMany({
        where: { expectedBy: { lt: now }, status: { in: ["PENDING", "IN_PROGRESS", "REPORTED", "ON_HOLD"] } },
        select: { expectedBy: true, transferRequest: { select: { id: true, reference: true, status: true } } }, orderBy: { expectedBy: "asc" }, take: 25
      }),
      this.database.dispute.findMany({
        where: { status: { in: ["OPEN", "IN_REVIEW"] } },
        select: { openedAt: true, transferRequest: { select: { id: true, reference: true, status: true } } }, orderBy: { openedAt: "asc" }, take: 25
      }),
      this.database.refundCase.findMany({
        where: { status: "PENDING" },
        select: { initiatedAt: true, transferRequest: { select: { id: true, reference: true, status: true } } }, orderBy: { initiatedAt: "asc" }, take: 25
      })
    ]);
    const workItems = [
      ...overdueQuotes.map((item) => ({ id: item.id, reference: item.reference, status: item.status, category: "OVERDUE_QUOTE", dueAt: item.quoteDueAt.toISOString() })),
      ...fundingAttention.map((item) => ({ id: item.id, reference: item.reference, status: item.status, category: "FUNDING_ATTENTION", dueAt: item.updatedAt.toISOString() })),
      ...overduePayouts.map((item) => ({ id: item.transferRequest.id, reference: item.transferRequest.reference, status: item.transferRequest.status, category: "OVERDUE_PAYOUT", dueAt: item.expectedBy.toISOString() })),
      ...activeDisputes.map((item) => ({ id: item.transferRequest.id, reference: item.transferRequest.reference, status: item.transferRequest.status, category: "ACTIVE_DISPUTE", dueAt: item.openedAt.toISOString() })),
      ...pendingRefunds.map((item) => ({ id: item.transferRequest.id, reference: item.transferRequest.reference, status: item.transferRequest.status, category: "PENDING_REFUND", dueAt: item.initiatedAt.toISOString() }))
    ].slice(0, 100);
    return {
      counts: {
        overdueQuotes: overdueQuotes.length,
        fundingAttention: fundingAttention.length,
        overduePayouts: overduePayouts.length,
        activeDisputes: activeDisputes.length,
        pendingRefunds: pendingRefunds.length
      },
      workItems
    };
  }
}
