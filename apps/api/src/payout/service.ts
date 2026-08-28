import { randomUUID } from "node:crypto";
import {
  ActivityOutcome,
  AssociateStatus,
  PayoutCaseStatus,
  QuoteStatus,
  Role,
  StaffOperationalStatus,
  TransferStatus,
  UserStatus,
  type Capability,
  type PayoutMethod
} from "../generated/prisma/enums.js";
import { writeActivity } from "../auth/audit.js";
import type { AuthPrincipal } from "../auth/service.js";
import type { HawellyPrismaClient } from "../db/prisma.js";
import { PublicApiError } from "../http/errors.js";
import type { RequestContext } from "../middleware/requestContext.js";
import { assertTransferTransition } from "../transfers/state.js";
import type { FundingWorkflowConfig } from "../funding/config.js";
import { EvidenceUrlSigner, type EvidenceOperation, type LocalEvidenceStorage } from "../funding/storage.js";

const MAX_BIGINT = 9_223_372_036_854_775_807n;

interface AssociateInput {
  businessName: string;
  countries: string[];
  cities: string[];
  payoutMethods: PayoutMethod[];
  currencies: string[];
  contactChannels: Record<string, string>;
  trustNotes?: string | undefined;
}

interface AssociatePatch {
  businessName?: string | undefined;
  countries?: string[] | undefined;
  cities?: string[] | undefined;
  payoutMethods?: PayoutMethod[] | undefined;
  currencies?: string[] | undefined;
  contactChannels?: Record<string, string> | undefined;
  trustNotes?: string | undefined;
  status?: AssociateStatus | undefined;
}

interface PayoutCaseInput {
  associateContactId?: string | undefined;
  expectedBy: string;
  externalReference?: string | undefined;
  internalNote?: string | undefined;
  senderFacingNote?: string | undefined;
}

interface PayoutCasePatch {
  staffOwnerId?: string | undefined;
  associateContactId?: string | undefined;
  expectedBy?: string | undefined;
  externalReference?: string | undefined;
  internalNote?: string | undefined;
  senderFacingNote?: string | undefined;
}

interface EvidenceInput {
  externalReference?: string | undefined;
  attachment?: { filename: string; contentType: string; sizeBytes: number } | undefined;
}

interface ReportInput {
  completedAmountMinor: string;
  currency: string;
  completedAt: string;
  externalReference?: string | undefined;
  internalNote?: string | undefined;
  senderFacingNote?: string | undefined;
}

function requireOperations(principal: AuthPrincipal) {
  if (principal.role !== Role.STAFF && principal.role !== Role.ADMIN) {
    throw new PublicApiError(403, "FORBIDDEN", "Forbidden");
  }
}

function requireSender(principal: AuthPrincipal) {
  if (principal.role !== Role.SENDER) throw new PublicApiError(403, "FORBIDDEN", "Forbidden");
}

function extensionFor(contentType: string, filename: string) {
  const normalized = filename.toLowerCase();
  if (contentType === "application/pdf" && normalized.endsWith(".pdf")) return "pdf";
  if (contentType === "image/png" && normalized.endsWith(".png")) return "png";
  if (contentType === "image/jpeg" && (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg"))) return "jpg";
  throw new PublicApiError(400, "INVALID_EVIDENCE_FILE", "Evidence filename does not match its content type");
}

function associateProjection(associate: {
  id: string; businessName: string; countries: string[]; cities: string[]; payoutMethods: PayoutMethod[];
  currencies: string[]; contactChannels: unknown; trustNotes: string | null; status: AssociateStatus;
  createdAt: Date; updatedAt: Date;
}) {
  return { ...associate, createdAt: associate.createdAt.toISOString(), updatedAt: associate.updatedAt.toISOString() };
}

function evidenceProjection(evidence: {
  id: string; payoutCaseId: string; storageObjectKey: string | null; externalReference: string | null;
  originalFilename: string | null; contentType: string | null; sizeBytes: bigint | null;
  uploadExpiresAt: Date | null; uploadedAt: Date | null; createdAt: Date;
}) {
  return {
    id: evidence.id,
    payoutCaseId: evidence.payoutCaseId,
    externalReference: evidence.externalReference,
    hasAttachment: Boolean(evidence.storageObjectKey && evidence.uploadedAt),
    originalFilename: evidence.originalFilename,
    contentType: evidence.contentType,
    sizeBytes: evidence.sizeBytes?.toString() ?? null,
    uploadExpiresAt: evidence.uploadExpiresAt?.toISOString() ?? null,
    uploadedAt: evidence.uploadedAt?.toISOString() ?? null,
    createdAt: evidence.createdAt.toISOString()
  };
}

function caseProjection(payoutCase: {
  id: string; transferRequestId: string; staffOwnerId: string; associateContactId: string | null;
  amountMinor: bigint; currency: string; payoutMethod: PayoutMethod; expectedBy: Date; status: PayoutCaseStatus;
  externalReference: string | null; internalNote: string | null; senderFacingNote: string | null;
  completedAmountMinor: bigint | null; completedCurrency: string | null; completedAt: Date | null;
  createdAt: Date; updatedAt: Date; associateContact?: Parameters<typeof associateProjection>[0] | null;
  staffOwner?: { id: string; fullName: string };
  evidence?: Parameters<typeof evidenceProjection>[0][];
}) {
  return {
    id: payoutCase.id,
    transferRequestId: payoutCase.transferRequestId,
    staffOwnerId: payoutCase.staffOwnerId,
    staffOwner: payoutCase.staffOwner ?? null,
    associateContactId: payoutCase.associateContactId,
    amountMinor: payoutCase.amountMinor.toString(),
    currency: payoutCase.currency,
    payoutMethod: payoutCase.payoutMethod,
    expectedBy: payoutCase.expectedBy.toISOString(),
    status: payoutCase.status,
    externalReference: payoutCase.externalReference,
    internalNote: payoutCase.internalNote,
    senderFacingNote: payoutCase.senderFacingNote,
    completedAmountMinor: payoutCase.completedAmountMinor?.toString() ?? null,
    completedCurrency: payoutCase.completedCurrency,
    completedAt: payoutCase.completedAt?.toISOString() ?? null,
    createdAt: payoutCase.createdAt.toISOString(),
    updatedAt: payoutCase.updatedAt.toISOString(),
    associate: payoutCase.associateContact ? associateProjection(payoutCase.associateContact) : null,
    evidence: payoutCase.evidence?.map(evidenceProjection) ?? []
  };
}

export class PayoutWorkflowService {
  private readonly signer: EvidenceUrlSigner;

  constructor(
    private readonly database: HawellyPrismaClient,
    private readonly storage: LocalEvidenceStorage,
    private readonly config: FundingWorkflowConfig,
    private readonly clock: () => Date = () => new Date()
  ) {
    this.signer = new EvidenceUrlSigner(config.signingSecret);
  }

  async auditCapabilityDenied(principal: AuthPrincipal, capability: Capability, context: RequestContext) {
    await writeActivity(this.database, {
      actorUserId: principal.userId,
      actorRole: principal.role,
      source: context.source,
      requestId: context.requestId,
      actionType: "AUTHORIZATION_DENIED",
      outcome: ActivityOutcome.DENIED,
      entityType: "Capability",
      entityId: capability,
      errorCode: "FORBIDDEN"
    });
  }

  async listAssociates(principal: AuthPrincipal) {
    requireOperations(principal);
    const associates = await this.database.associateContact.findMany({ orderBy: [{ status: "asc" }, { businessName: "asc" }] });
    return associates.map(associateProjection);
  }

  async createAssociate(principal: AuthPrincipal, input: AssociateInput, context: RequestContext) {
    requireOperations(principal);
    const associate = await this.database.associateContact.create({
      data: { ...input, trustNotes: input.trustNotes ?? null, createdByStaffId: principal.userId }
    });
    await writeActivity(this.database, {
      actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId,
      actionType: "ASSOCIATE_CONTACT_CREATED", outcome: ActivityOutcome.SUCCESS,
      entityType: "AssociateContact", entityId: associate.id,
      nextState: { status: associate.status }, metadata: { countries: associate.countries, payoutMethods: associate.payoutMethods, currencies: associate.currencies }
    });
    return associateProjection(associate);
  }

  async updateAssociate(principal: AuthPrincipal, id: string, input: AssociatePatch, context: RequestContext) {
    requireOperations(principal);
    const existing = await this.database.associateContact.findUnique({ where: { id } });
    if (!existing) throw new PublicApiError(404, "ASSOCIATE_NOT_FOUND", "Associate contact not found");
    const updated = await this.database.associateContact.update({ where: { id }, data: {
      ...(input.businessName !== undefined ? { businessName: input.businessName } : {}),
      ...(input.countries !== undefined ? { countries: input.countries } : {}),
      ...(input.cities !== undefined ? { cities: input.cities } : {}),
      ...(input.payoutMethods !== undefined ? { payoutMethods: input.payoutMethods } : {}),
      ...(input.currencies !== undefined ? { currencies: input.currencies } : {}),
      ...(input.contactChannels !== undefined ? { contactChannels: input.contactChannels } : {}),
      ...(input.trustNotes !== undefined ? { trustNotes: input.trustNotes } : {}),
      ...(input.status !== undefined ? { status: input.status } : {})
    } });
    await writeActivity(this.database, {
      actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId,
      actionType: "ASSOCIATE_CONTACT_UPDATED", outcome: ActivityOutcome.SUCCESS,
      entityType: "AssociateContact", entityId: id,
      previousState: { status: existing.status }, nextState: { status: updated.status }, metadata: { changedFields: Object.keys(input) }
    });
    return associateProjection(updated);
  }

  private async requireCompatibleAssociate(database: HawellyPrismaClient, id: string, destinationCountry: string, payoutMethod: PayoutMethod, currency: string) {
    const associate = await database.associateContact.findUnique({ where: { id } });
    if (!associate || associate.status !== AssociateStatus.ACTIVE || !associate.countries.includes(destinationCountry) || !associate.payoutMethods.includes(payoutMethod) || !associate.currencies.includes(currency)) {
      throw new PublicApiError(400, "ASSOCIATE_UNAVAILABLE", "Associate contact is unavailable for this payout");
    }
    return associate;
  }

  private async requireActiveOwner(database: HawellyPrismaClient, id: string) {
    const owner = await database.user.findUnique({ where: { id }, include: { staffProfile: true } });
    if (!owner || (owner.role !== Role.STAFF && owner.role !== Role.ADMIN) || owner.status !== UserStatus.ACTIVE || !owner.staffProfile || owner.staffProfile.operationalStatus !== StaffOperationalStatus.ACTIVE) {
      throw new PublicApiError(400, "PAYOUT_OWNER_UNAVAILABLE", "Payout owner must be active operations staff");
    }
  }

  async createCase(principal: AuthPrincipal, transferId: string, input: PayoutCaseInput, context: RequestContext) {
    requireOperations(principal);
    const now = this.clock();
    const expectedBy = new Date(input.expectedBy);
    if (expectedBy <= now) throw new PublicApiError(400, "INVALID_PAYOUT_DEADLINE", "Expected delivery must be in the future");
    const created = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id: transferId }, include: { acceptedQuote: true, payoutCase: true } });
      if (!transfer) throw new PublicApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
      if (transfer.status !== TransferStatus.FUNDS_CONFIRMED || transfer.payoutCase || !transfer.acceptedQuote || transfer.acceptedQuote.status !== QuoteStatus.ACCEPTED) {
        throw new PublicApiError(409, "PAYOUT_NOT_READY", "Transfer is not ready for payout operations");
      }
      await this.requireActiveOwner(transaction as HawellyPrismaClient, principal.userId);
      if (input.associateContactId) {
        await this.requireCompatibleAssociate(transaction as HawellyPrismaClient, input.associateContactId, transfer.destinationCountry, transfer.requestedPayoutMethod, transfer.acceptedQuote.receiveCurrency);
      }
      const payoutCase = await transaction.payoutCase.create({ data: {
        transferRequestId: transfer.id,
        staffOwnerId: principal.userId,
        associateContactId: input.associateContactId ?? null,
        amountMinor: transfer.acceptedQuote.receiveAmountMinor,
        currency: transfer.acceptedQuote.receiveCurrency,
        payoutMethod: transfer.requestedPayoutMethod,
        expectedBy,
        status: PayoutCaseStatus.IN_PROGRESS,
        externalReference: input.externalReference ?? null,
        internalNote: input.internalNote ?? null,
        senderFacingNote: input.senderFacingNote ?? null,
        createdAt: now
      } });
      assertTransferTransition(transfer.status, TransferStatus.PAYOUT_IN_PROGRESS);
      await transaction.transferRequest.update({ where: { id: transfer.id }, data: { status: TransferStatus.PAYOUT_IN_PROGRESS } });
      await writeActivity(transaction, {
        actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId,
        actionType: "PAYOUT_STARTED", outcome: ActivityOutcome.SUCCESS, entityType: "TransferRequest", entityId: transfer.id,
        previousState: { status: TransferStatus.FUNDS_CONFIRMED }, nextState: { status: TransferStatus.PAYOUT_IN_PROGRESS },
        metadata: { payoutCaseId: payoutCase.id, associateContactId: payoutCase.associateContactId, expectedBy: expectedBy.toISOString() }
      });
      return payoutCase;
    });
    return caseProjection(created);
  }

  async getOperationsPayout(principal: AuthPrincipal, transferId: string) {
    requireOperations(principal);
    const transfer = await this.database.transferRequest.findUnique({ where: { id: transferId }, include: { payoutCase: { include: { associateContact: true, staffOwner: { select: { id: true, fullName: true } }, evidence: { orderBy: { createdAt: "desc" } } } } } });
    if (!transfer) throw new PublicApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
    return { transferStatus: transfer.status, payoutCase: transfer.payoutCase ? caseProjection(transfer.payoutCase) : null };
  }

  async getSenderPayout(principal: AuthPrincipal, transferId: string) {
    requireSender(principal);
    const transfer = await this.database.transferRequest.findUnique({ where: { id_senderId: { id: transferId, senderId: principal.userId } }, include: { payoutCase: true } });
    if (!transfer) throw new PublicApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
    const payoutCase = transfer.payoutCase;
    return {
      transferStatus: transfer.status,
      payout: payoutCase ? {
        status: payoutCase.status,
        amountMinor: payoutCase.amountMinor.toString(),
        currency: payoutCase.currency,
        payoutMethod: payoutCase.payoutMethod,
        expectedBy: payoutCase.expectedBy.toISOString(),
        senderFacingNote: payoutCase.senderFacingNote,
        completedAt: payoutCase.completedAt?.toISOString() ?? null
      } : null
    };
  }

  async updateCase(principal: AuthPrincipal, transferId: string, input: PayoutCasePatch, context: RequestContext) {
    requireOperations(principal);
    const now = this.clock();
    const result = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id: transferId }, include: { acceptedQuote: true, payoutCase: true } });
      if (!transfer || !transfer.payoutCase) throw new PublicApiError(404, "PAYOUT_CASE_NOT_FOUND", "Payout case not found");
      if (transfer.status !== TransferStatus.PAYOUT_IN_PROGRESS || transfer.payoutCase.status !== PayoutCaseStatus.IN_PROGRESS || !transfer.acceptedQuote) {
        throw new PublicApiError(409, "PAYOUT_CASE_NOT_EDITABLE", "Payout case is not editable");
      }
      if (input.expectedBy && new Date(input.expectedBy) <= now) throw new PublicApiError(400, "INVALID_PAYOUT_DEADLINE", "Expected delivery must be in the future");
      if (input.staffOwnerId) await this.requireActiveOwner(transaction as HawellyPrismaClient, input.staffOwnerId);
      if (input.associateContactId) await this.requireCompatibleAssociate(transaction as HawellyPrismaClient, input.associateContactId, transfer.destinationCountry, transfer.requestedPayoutMethod, transfer.acceptedQuote.receiveCurrency);
      const payoutCase = await transaction.payoutCase.update({ where: { id: transfer.payoutCase.id }, data: {
        ...(input.staffOwnerId !== undefined ? { staffOwnerId: input.staffOwnerId } : {}),
        ...(input.associateContactId !== undefined ? { associateContactId: input.associateContactId } : {}),
        ...(input.expectedBy !== undefined ? { expectedBy: new Date(input.expectedBy) } : {}),
        ...(input.externalReference !== undefined ? { externalReference: input.externalReference } : {}),
        ...(input.internalNote !== undefined ? { internalNote: input.internalNote } : {}),
        ...(input.senderFacingNote !== undefined ? { senderFacingNote: input.senderFacingNote } : {})
      } });
      await writeActivity(transaction, {
        actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId,
        actionType: "PAYOUT_CASE_UPDATED", outcome: ActivityOutcome.SUCCESS, entityType: "PayoutCase", entityId: payoutCase.id,
        metadata: { transferRequestId: transferId, changedFields: Object.keys(input) }
      });
      return payoutCase;
    });
    return caseProjection(result);
  }

  private signedUrl(operation: EvidenceOperation, evidenceId: string, objectKey: string, expires: number) {
    const route = operation === "upload" ? "payout-uploads" : "payout-downloads";
    const url = new URL(`/evidence/${route}/${evidenceId}`, this.config.publicBaseUrl);
    url.searchParams.set("expires", String(expires));
    url.searchParams.set("signature", this.signer.sign(operation, evidenceId, objectKey, expires));
    return url.toString();
  }

  async addEvidence(principal: AuthPrincipal, transferId: string, input: EvidenceInput, context: RequestContext) {
    requireOperations(principal);
    const now = this.clock();
    let attachment: { filename: string; contentType: string; sizeBytes: number; extension: string } | null = null;
    if (input.attachment) {
      if (!this.config.allowedContentTypes.includes(input.attachment.contentType)) throw new PublicApiError(400, "INVALID_EVIDENCE_TYPE", "Evidence file type is not allowed");
      if (input.attachment.sizeBytes > this.config.maximumProofBytes) throw new PublicApiError(413, "EVIDENCE_TOO_LARGE", "Evidence file is too large");
      attachment = { ...input.attachment, extension: extensionFor(input.attachment.contentType, input.attachment.filename) };
    }
    const evidenceId = randomUUID();
    const uploadExpiresAt = attachment ? new Date(now.getTime() + this.config.signedUrlTtlSeconds * 1_000) : null;
    const result = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id: transferId }, include: { payoutCase: true } });
      if (!transfer || !transfer.payoutCase) throw new PublicApiError(404, "PAYOUT_CASE_NOT_FOUND", "Payout case not found");
      if (transfer.status !== TransferStatus.PAYOUT_IN_PROGRESS || transfer.payoutCase.status !== PayoutCaseStatus.IN_PROGRESS) throw new PublicApiError(409, "PAYOUT_EVIDENCE_NOT_ALLOWED", "Payout evidence cannot be added in this state");
      const objectKey = attachment ? `transfers/${transferId}/payout/${evidenceId}/evidence.${attachment.extension}` : null;
      const evidence = await transaction.payoutEvidence.create({ data: {
        id: evidenceId, payoutCaseId: transfer.payoutCase.id, storageObjectKey: objectKey,
        externalReference: input.externalReference ?? null, originalFilename: attachment?.filename ?? null,
        contentType: attachment?.contentType ?? null, sizeBytes: attachment ? BigInt(attachment.sizeBytes) : null,
        uploadExpiresAt, createdByStaffId: principal.userId, createdAt: now
      } });
      await writeActivity(transaction, {
        actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId,
        actionType: attachment ? "PAYOUT_EVIDENCE_UPLOAD_REQUESTED" : "PAYOUT_EVIDENCE_RECORDED", outcome: ActivityOutcome.SUCCESS,
        entityType: "PayoutEvidence", entityId: evidence.id, metadata: { transferRequestId: transferId, payoutCaseId: transfer.payoutCase.id, hasAttachment: Boolean(attachment) }
      });
      return { evidence, objectKey };
    });
    return {
      evidence: evidenceProjection(result.evidence),
      upload: attachment && result.objectKey && uploadExpiresAt ? {
        url: this.signedUrl("upload", evidenceId, result.objectKey, Math.floor(uploadExpiresAt.getTime() / 1_000)),
        method: "PUT", contentType: attachment.contentType, sizeBytes: attachment.sizeBytes, expiresAt: uploadExpiresAt.toISOString()
      } : null
    };
  }

  async completeUpload(evidenceId: string, expires: number, signature: string, contentType: string, source: AsyncIterable<Uint8Array>, context: RequestContext) {
    const now = this.clock();
    const evidence = await this.database.payoutEvidence.findUnique({ where: { id: evidenceId }, include: { payoutCase: { include: { transferRequest: true } }, createdByStaff: true } });
    if (!evidence || !evidence.storageObjectKey || !evidence.contentType || !evidence.sizeBytes || !evidence.uploadExpiresAt) throw new PublicApiError(404, "EVIDENCE_UPLOAD_NOT_FOUND", "Evidence upload was not found");
    if (evidence.uploadedAt) throw new PublicApiError(409, "EVIDENCE_UPLOAD_CLOSED", "Evidence upload is no longer available");
    if (expires <= Math.floor(now.getTime() / 1_000) || evidence.uploadExpiresAt <= now) throw new PublicApiError(410, "EVIDENCE_URL_EXPIRED", "Evidence upload URL has expired");
    if (!this.signer.verify("upload", evidence.id, evidence.storageObjectKey, expires, signature)) throw new PublicApiError(403, "INVALID_EVIDENCE_SIGNATURE", "Evidence upload URL is invalid");
    if (contentType !== evidence.contentType) throw new PublicApiError(400, "EVIDENCE_TYPE_MISMATCH", "Evidence content type does not match the upload request");
    await this.storage.writeObject(evidence.storageObjectKey, source, Number(evidence.sizeBytes), contentType);
    try {
      const updated = await this.database.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${evidence.payoutCase.transferRequestId}::uuid FOR UPDATE`;
        const current = await transaction.payoutEvidence.findUnique({ where: { id: evidence.id }, include: { payoutCase: { include: { transferRequest: true } } } });
        if (!current || current.uploadedAt || current.payoutCase.status !== PayoutCaseStatus.IN_PROGRESS || current.payoutCase.transferRequest.status !== TransferStatus.PAYOUT_IN_PROGRESS) throw new PublicApiError(409, "EVIDENCE_UPLOAD_CLOSED", "Evidence upload is no longer available");
        const saved = await transaction.payoutEvidence.update({ where: { id: evidence.id }, data: { uploadedAt: now } });
        await writeActivity(transaction, {
          actorUserId: evidence.createdByStaffId, actorRole: evidence.createdByStaff.role, source: context.source, requestId: context.requestId,
          actionType: "PAYOUT_EVIDENCE_RECORDED", outcome: ActivityOutcome.SUCCESS, entityType: "PayoutEvidence", entityId: evidence.id,
          metadata: { transferRequestId: evidence.payoutCase.transferRequestId, payoutCaseId: evidence.payoutCaseId, sizeBytes: Number(evidence.sizeBytes) }
        });
        return saved;
      });
      return evidenceProjection(updated);
    } catch (error) {
      await this.storage.deleteObject(evidence.storageObjectKey);
      throw error;
    }
  }

  async issueReadUrl(principal: AuthPrincipal, transferId: string, evidenceId: string, context: RequestContext) {
    requireOperations(principal);
    const evidence = await this.database.payoutEvidence.findFirst({ where: { id: evidenceId, payoutCase: { transferRequestId: transferId } } });
    if (!evidence || !evidence.storageObjectKey || !evidence.uploadedAt) throw new PublicApiError(404, "EVIDENCE_NOT_FOUND", "Evidence file was not found");
    const expires = Math.floor((this.clock().getTime() + this.config.signedUrlTtlSeconds * 1_000) / 1_000);
    await writeActivity(this.database, {
      actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId,
      actionType: "EVIDENCE_READ_URL_ISSUED", outcome: ActivityOutcome.SUCCESS, entityType: "PayoutEvidence", entityId: evidence.id,
      metadata: { transferRequestId: transferId, audience: "operations" }
    });
    return { url: this.signedUrl("download", evidence.id, evidence.storageObjectKey, expires), expiresAt: new Date(expires * 1_000).toISOString() };
  }

  async openDownload(evidenceId: string, expires: number, signature: string) {
    const evidence = await this.database.payoutEvidence.findUnique({ where: { id: evidenceId } });
    if (!evidence || !evidence.storageObjectKey || !evidence.uploadedAt || !evidence.contentType || !evidence.originalFilename) throw new PublicApiError(404, "EVIDENCE_NOT_FOUND", "Evidence file was not found");
    if (expires <= Math.floor(this.clock().getTime() / 1_000)) throw new PublicApiError(410, "EVIDENCE_URL_EXPIRED", "Evidence read URL has expired");
    if (!this.signer.verify("download", evidence.id, evidence.storageObjectKey, expires, signature)) throw new PublicApiError(403, "INVALID_EVIDENCE_SIGNATURE", "Evidence read URL is invalid");
    return { ...(await this.storage.openObject(evidence.storageObjectKey)), contentType: evidence.contentType, filename: evidence.originalFilename };
  }

  async reportPayout(principal: AuthPrincipal, transferId: string, input: ReportInput, context: RequestContext) {
    requireOperations(principal);
    const now = this.clock();
    const completedAt = new Date(input.completedAt);
    const completedAmount = BigInt(input.completedAmountMinor);
    if (completedAmount > MAX_BIGINT || completedAt > new Date(now.getTime() + 5 * 60_000)) throw new PublicApiError(400, "INVALID_PAYOUT_COMPLETION", "Payout completion details are invalid");
    const payoutCase = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id: transferId }, include: { payoutCase: { include: { evidence: true } } } });
      if (!transfer || !transfer.payoutCase) throw new PublicApiError(404, "PAYOUT_CASE_NOT_FOUND", "Payout case not found");
      const current = transfer.payoutCase;
      if (transfer.status !== TransferStatus.PAYOUT_IN_PROGRESS || current.status !== PayoutCaseStatus.IN_PROGRESS) throw new PublicApiError(409, "PAYOUT_REPORT_NOT_ALLOWED", "Payout cannot be reported in this state");
      if (!current.associateContactId) throw new PublicApiError(409, "PAYOUT_ASSOCIATE_REQUIRED", "An associate contact must be assigned before payout is reported");
      await transaction.$queryRaw`SELECT "id" FROM "AssociateContact" WHERE "id" = ${current.associateContactId}::uuid FOR UPDATE`;
      await this.requireCompatibleAssociate(transaction as HawellyPrismaClient, current.associateContactId, transfer.destinationCountry, current.payoutMethod, current.currency);
      if (completedAmount !== current.amountMinor || input.currency !== current.currency || completedAt < current.createdAt) throw new PublicApiError(409, "PAYOUT_COMPLETION_MISMATCH", "Payout completion must match the committed payout");
      const hasEvidence = Boolean(input.externalReference || current.externalReference || current.evidence.some((item) => item.externalReference || item.uploadedAt));
      if (!hasEvidence) throw new PublicApiError(409, "PAYOUT_EVIDENCE_REQUIRED", "A payout reference or uploaded receipt is required");
      const reported = await transaction.payoutCase.update({ where: { id: current.id }, data: {
        status: PayoutCaseStatus.REPORTED,
        completedAmountMinor: completedAmount,
        completedCurrency: input.currency,
        completedAt,
        externalReference: input.externalReference ?? current.externalReference,
        internalNote: input.internalNote ?? current.internalNote,
        senderFacingNote: input.senderFacingNote ?? current.senderFacingNote
      } });
      assertTransferTransition(transfer.status, TransferStatus.PAYOUT_REPORTED);
      await transaction.transferRequest.update({ where: { id: transfer.id }, data: { status: TransferStatus.PAYOUT_REPORTED } });
      await transaction.transferConfirmation.create({ data: {
        transferRequestId: transfer.id,
        source: "STAFF",
        actorUserId: principal.userId,
        note: input.senderFacingNote ?? null,
        confirmedAt: now
      } });
      await writeActivity(transaction, {
        actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId,
        actionType: "PAYOUT_REPORTED", outcome: ActivityOutcome.SUCCESS, entityType: "TransferRequest", entityId: transfer.id,
        previousState: { status: TransferStatus.PAYOUT_IN_PROGRESS }, nextState: { status: TransferStatus.PAYOUT_REPORTED },
        metadata: { payoutCaseId: current.id, completedAmountMinor: input.completedAmountMinor, currency: input.currency, completedAt: completedAt.toISOString() }
      });
      return reported;
    });
    return { transferStatus: TransferStatus.PAYOUT_REPORTED, payoutCase: caseProjection(payoutCase) };
  }

  async hold(principal: AuthPrincipal, transferId: string, reason: string, senderFacingNote: string | undefined, context: RequestContext) {
    return this.changeHold(principal, transferId, true, reason, senderFacingNote, context);
  }

  async release(principal: AuthPrincipal, transferId: string, reason: string, senderFacingNote: string | undefined, context: RequestContext) {
    return this.changeHold(principal, transferId, false, reason, senderFacingNote, context);
  }

  private async changeHold(principal: AuthPrincipal, transferId: string, placeHold: boolean, reason: string, senderFacingNote: string | undefined, context: RequestContext) {
    requireOperations(principal);
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id: transferId }, include: { payoutCase: true } });
      if (!transfer || !transfer.payoutCase) throw new PublicApiError(404, "PAYOUT_CASE_NOT_FOUND", "Payout case not found");
      const expectedTransfer = placeHold ? TransferStatus.PAYOUT_IN_PROGRESS : TransferStatus.ON_HOLD;
      const expectedCase = placeHold ? PayoutCaseStatus.IN_PROGRESS : PayoutCaseStatus.ON_HOLD;
      if (transfer.status !== expectedTransfer || transfer.payoutCase.status !== expectedCase) throw new PublicApiError(409, "PAYOUT_HOLD_NOT_ALLOWED", "Payout hold action is not allowed in this state");
      const nextTransfer = placeHold ? TransferStatus.ON_HOLD : TransferStatus.PAYOUT_IN_PROGRESS;
      const nextCase = placeHold ? PayoutCaseStatus.ON_HOLD : PayoutCaseStatus.IN_PROGRESS;
      if (placeHold) assertTransferTransition(transfer.status, nextTransfer);
      const payoutCase = await transaction.payoutCase.update({ where: { id: transfer.payoutCase.id }, data: { status: nextCase, ...(senderFacingNote ? { senderFacingNote } : {}) } });
      await transaction.transferRequest.update({ where: { id: transfer.id }, data: { status: nextTransfer } });
      await writeActivity(transaction, {
        actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId,
        actionType: placeHold ? "PAYOUT_ON_HOLD" : "PAYOUT_HOLD_RELEASED", outcome: ActivityOutcome.SUCCESS,
        entityType: "TransferRequest", entityId: transfer.id, previousState: { status: expectedTransfer }, nextState: { status: nextTransfer },
        reason, metadata: { payoutCaseId: payoutCase.id }
      });
      return { transferStatus: nextTransfer, payoutCase: caseProjection(payoutCase) };
    });
  }
}
