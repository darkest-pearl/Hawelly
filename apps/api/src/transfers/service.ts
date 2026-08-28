import { randomBytes } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import {
  ActivityOutcome,
  QuoteStatus,
  Role,
  TransferStatus
} from "../generated/prisma/enums.js";
import type { PayoutMethod } from "../generated/prisma/enums.js";
import type { Capability } from "../generated/prisma/enums.js";
import { writeActivity } from "../auth/audit.js";
import type { AuthPrincipal } from "../auth/service.js";
import type { HawellyPrismaClient } from "../db/prisma.js";
import { PublicApiError } from "../http/errors.js";
import type { RequestContext } from "../middleware/requestContext.js";
import type { TransferWorkflowConfig } from "./config.js";
import {
  assertTransferTransition,
  reviewActionTarget,
  type RequestReviewAction
} from "./state.js";
import { parsePayoutDetails } from "./validation.js";

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;
const SENDER_TIMELINE_ACTIONS = [
  "TRANSFER_REQUEST_CREATED",
  "TRANSFER_REQUEST_CANCELLED",
  "TRANSFER_REQUEST_INFO_NEEDED",
  "TRANSFER_REQUEST_QUOTING_STARTED",
  "TRANSFER_REQUEST_DECLINED",
  "QUOTE_READY",
  "QUOTE_ACCEPTED",
  "QUOTE_REJECTED",
  "QUOTE_EXPIRED",
  "FUNDING_INSTRUCTIONS_PUBLISHED",
  "FUNDING_PROOF_SUBMITTED",
  "FUNDING_PROOF_RESUBMISSION_REQUESTED",
  "FUNDING_PROOF_REJECTED",
  "FUNDING_PROOF_VERIFIED",
  "FUNDS_RECEIVED_CONFIRMED",
  "PAYOUT_STARTED",
  "PAYOUT_REPORTED",
  "PAYOUT_ON_HOLD",
  "PAYOUT_HOLD_RELEASED",
  "RECIPIENT_CONFIRMATION_REQUESTED",
  "RECIPIENT_RECEIPT_CONFIRMED",
  "DISPUTE_OPENED",
  "DISPUTE_RESOLVED",
  "REFUND_STARTED",
  "REFUND_CONFIRMED"
] as const;

type Clock = () => Date;
type ReferenceFactory = (now: Date) => string;

export interface RecipientInput {
  fullName: string;
  country: string;
  phone?: string | null | undefined;
  payoutMethod: PayoutMethod;
  payoutDetails: Record<string, unknown>;
  address?: string | null | undefined;
}

export interface RecipientPatch {
  fullName?: string | undefined;
  country?: string | undefined;
  phone?: string | null | undefined;
  payoutMethod?: PayoutMethod | undefined;
  payoutDetails?: Record<string, unknown> | undefined;
  address?: string | null | undefined;
}

export interface TransferInput {
  recipientId: string;
  originCountry: string;
  destinationCountry: string;
  sendAmountMinor: string;
  sendCurrency: string;
  requestedPayoutMethod: PayoutMethod;
  senderNote?: string | undefined;
}

function requireSender(principal: AuthPrincipal) {
  if (principal.role !== Role.SENDER) {
    throw new PublicApiError(403, "FORBIDDEN", "Forbidden");
  }
}

function requireOperations(principal: AuthPrincipal) {
  if (principal.role !== Role.STAFF && principal.role !== Role.ADMIN) {
    throw new PublicApiError(403, "FORBIDDEN", "Forbidden");
  }
}

function recipientProjection(recipient: {
  id: string;
  fullName: string;
  country: string;
  phone: string | null;
  payoutMethod: PayoutMethod;
  payoutDetails: unknown;
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: recipient.id,
    fullName: recipient.fullName,
    country: recipient.country,
    phone: recipient.phone,
    payoutMethod: recipient.payoutMethod,
    payoutDetails: recipient.payoutDetails,
    address: recipient.address,
    createdAt: recipient.createdAt.toISOString(),
    updatedAt: recipient.updatedAt.toISOString()
  };
}

function transferProjection(transfer: {
  id: string;
  reference: string;
  recipientId: string;
  originCountry: string;
  destinationCountry: string;
  sendAmountMinor: bigint;
  sendCurrency: string;
  requestedPayoutMethod: PayoutMethod;
  recipientSnapshot: unknown;
  status: TransferStatus;
  quoteDueAt: Date;
  senderNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: transfer.id,
    reference: transfer.reference,
    recipientId: transfer.recipientId,
    originCountry: transfer.originCountry,
    destinationCountry: transfer.destinationCountry,
    sendAmountMinor: transfer.sendAmountMinor.toString(),
    sendCurrency: transfer.sendCurrency,
    requestedPayoutMethod: transfer.requestedPayoutMethod,
    recipient: transfer.recipientSnapshot,
    status: transfer.status,
    quoteDueAt: transfer.quoteDueAt.toISOString(),
    senderNote: transfer.senderNote,
    createdAt: transfer.createdAt.toISOString(),
    updatedAt: transfer.updatedAt.toISOString()
  };
}

function queueProjection(transfer: {
  id: string;
  reference: string;
  originCountry: string;
  destinationCountry: string;
  sendAmountMinor: bigint;
  sendCurrency: string;
  requestedPayoutMethod: PayoutMethod;
  recipientSnapshot: unknown;
  status: TransferStatus;
  quoteDueAt: Date;
  createdAt: Date;
  sender: { id: string; fullName: string };
}) {
  const snapshot =
    transfer.recipientSnapshot &&
    typeof transfer.recipientSnapshot === "object" &&
    !Array.isArray(transfer.recipientSnapshot)
      ? (transfer.recipientSnapshot as Record<string, unknown>)
      : {};
  return {
    id: transfer.id,
    reference: transfer.reference,
    sender: transfer.sender,
    recipientName:
      typeof snapshot.fullName === "string" ? snapshot.fullName : "Recipient",
    originCountry: transfer.originCountry,
    destinationCountry: transfer.destinationCountry,
    sendAmountMinor: transfer.sendAmountMinor.toString(),
    sendCurrency: transfer.sendCurrency,
    requestedPayoutMethod: transfer.requestedPayoutMethod,
    status: transfer.status,
    quoteDueAt: transfer.quoteDueAt.toISOString(),
    createdAt: transfer.createdAt.toISOString()
  };
}

function defaultReference(now: Date) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `HW-${date}-${randomBytes(10).toString("hex").toUpperCase()}`;
}

function stateActionName(status: TransferStatus) {
  if (status === TransferStatus.CANCELLED) return "TRANSFER_REQUEST_CANCELLED";
  if (status === TransferStatus.NEEDS_INFO) return "TRANSFER_REQUEST_INFO_NEEDED";
  if (status === TransferStatus.QUOTING) return "TRANSFER_REQUEST_QUOTING_STARTED";
  if (status === TransferStatus.DECLINED) return "TRANSFER_REQUEST_DECLINED";
  return "TRANSFER_STATUS_CHANGED";
}

export class TransferWorkflowService {
  constructor(
    private readonly database: HawellyPrismaClient,
    private readonly config: TransferWorkflowConfig,
    private readonly clock: Clock = () => new Date(),
    private readonly referenceFactory: ReferenceFactory = defaultReference
  ) {}

  private supportedDestination(country: string, payoutMethod: PayoutMethod) {
    return this.config.corridors.some(
      (corridor) =>
        corridor.destinationCountry === country &&
        corridor.payoutMethods.includes(payoutMethod)
    );
  }

  private corridorFor(input: TransferInput) {
    return this.config.corridors.find(
      (corridor) =>
        corridor.originCountry === input.originCountry &&
        corridor.destinationCountry === input.destinationCountry &&
        corridor.sendCurrencies.includes(input.sendCurrency) &&
        corridor.payoutMethods.includes(input.requestedPayoutMethod)
    );
  }

  private async auditDenied(
    principal: AuthPrincipal,
    context: RequestContext,
    entityType: "Recipient" | "TransferRequest",
    entityId: string
  ) {
    await writeActivity(this.database, {
      actorUserId: principal.userId,
      actorRole: principal.role,
      source: context.source,
      requestId: context.requestId,
      actionType: `${entityType.toUpperCase()}_ACCESS_DENIED`,
      outcome: ActivityOutcome.DENIED,
      entityType,
      entityId,
      errorCode: "NOT_FOUND",
      metadata: {}
    });
  }

  async auditCapabilityDenied(
    principal: AuthPrincipal,
    capability: Capability,
    context: RequestContext
  ) {
    await writeActivity(this.database, {
      actorUserId: principal.userId,
      actorRole: principal.role,
      source: context.source,
      requestId: context.requestId,
      actionType: "AUTHORIZATION_DENIED",
      outcome: ActivityOutcome.DENIED,
      entityType: "Capability",
      entityId: capability,
      errorCode: "FORBIDDEN",
      metadata: {}
    });
  }

  async listRecipients(principal: AuthPrincipal, limit: number) {
    requireSender(principal);
    const recipients = await this.database.recipient.findMany({
      where: { ownerSenderId: principal.userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit
    });
    return recipients.map(recipientProjection);
  }

  async getRecipient(principal: AuthPrincipal, id: string, context: RequestContext) {
    requireSender(principal);
    const recipient = await this.database.recipient.findUnique({
      where: { id_ownerSenderId: { id, ownerSenderId: principal.userId } }
    });
    if (!recipient) {
      await this.auditDenied(principal, context, "Recipient", id);
      throw new PublicApiError(404, "RECIPIENT_NOT_FOUND", "Recipient not found");
    }
    return recipientProjection(recipient);
  }

  async createRecipient(
    principal: AuthPrincipal,
    input: RecipientInput,
    context: RequestContext
  ) {
    requireSender(principal);
    if (!this.supportedDestination(input.country, input.payoutMethod)) {
      throw new PublicApiError(
        400,
        "UNSUPPORTED_RECIPIENT_DESTINATION",
        "Recipient country or payout method is not supported"
      );
    }
    const payoutDetails = parsePayoutDetails(input.payoutMethod, input.payoutDetails);
    const recipient = await this.database.$transaction(async (transaction) => {
      const created = await transaction.recipient.create({
        data: {
          ownerSenderId: principal.userId,
          fullName: input.fullName,
          country: input.country,
          phone: input.phone ?? null,
          payoutMethod: input.payoutMethod,
          payoutDetails,
          address: input.address ?? null
        }
      });
      await writeActivity(transaction, {
        actorUserId: principal.userId,
        actorRole: principal.role,
        source: context.source,
        requestId: context.requestId,
        actionType: "RECIPIENT_CREATED",
        outcome: ActivityOutcome.SUCCESS,
        entityType: "Recipient",
        entityId: created.id,
        metadata: { country: created.country, payoutMethod: created.payoutMethod }
      });
      return created;
    });
    return recipientProjection(recipient);
  }

  async updateRecipient(
    principal: AuthPrincipal,
    id: string,
    input: RecipientPatch,
    context: RequestContext
  ) {
    requireSender(principal);
    const updated = await this.database.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Recipient"
        WHERE "id" = ${id}::uuid
          AND "ownerSenderId" = ${principal.userId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) return null;

      const existing = await transaction.recipient.findUniqueOrThrow({
        where: { id_ownerSenderId: { id, ownerSenderId: principal.userId } }
      });
      const payoutMethod = input.payoutMethod ?? existing.payoutMethod;
      const country = input.country ?? existing.country;
      if (!this.supportedDestination(country, payoutMethod)) {
        throw new PublicApiError(
          400,
          "UNSUPPORTED_RECIPIENT_DESTINATION",
          "Recipient country or payout method is not supported"
        );
      }
      if (input.payoutMethod && !input.payoutDetails) {
        throw new PublicApiError(
          400,
          "PAYOUT_DETAILS_REQUIRED",
          "Payout details are required when payout method changes"
        );
      }
      const payoutDetails = input.payoutDetails
        ? parsePayoutDetails(payoutMethod, input.payoutDetails)
        : undefined;
      const data: Prisma.RecipientUpdateInput = {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.payoutMethod !== undefined ? { payoutMethod } : {}),
        ...(payoutDetails !== undefined ? { payoutDetails } : {})
      };
      const result = await transaction.recipient.update({
        where: { id_ownerSenderId: { id, ownerSenderId: principal.userId } },
        data
      });
      await writeActivity(transaction, {
        actorUserId: principal.userId,
        actorRole: principal.role,
        source: context.source,
        requestId: context.requestId,
        actionType: "RECIPIENT_UPDATED",
        outcome: ActivityOutcome.SUCCESS,
        entityType: "Recipient",
        entityId: result.id,
        metadata: { changedFields: Object.keys(input).sort() }
      });
      return result;
    });
    if (!updated) {
      await this.auditDenied(principal, context, "Recipient", id);
      throw new PublicApiError(404, "RECIPIENT_NOT_FOUND", "Recipient not found");
    }
    return recipientProjection(updated);
  }

  async deleteRecipient(principal: AuthPrincipal, id: string, context: RequestContext) {
    requireSender(principal);
    const existing = await this.database.recipient.findUnique({
      where: { id_ownerSenderId: { id, ownerSenderId: principal.userId } },
      select: { id: true }
    });
    if (!existing) {
      await this.auditDenied(principal, context, "Recipient", id);
      throw new PublicApiError(404, "RECIPIENT_NOT_FOUND", "Recipient not found");
    }
    const referenced = await this.database.transferRequest.count({
      where: { recipientId: id, senderId: principal.userId }
    });
    if (referenced > 0) {
      throw new PublicApiError(
        409,
        "RECIPIENT_IN_USE",
        "Recipient is used by a transfer request"
      );
    }
    try {
      await this.database.$transaction(async (transaction) => {
        await transaction.recipient.delete({
          where: { id_ownerSenderId: { id, ownerSenderId: principal.userId } }
        });
        await writeActivity(transaction, {
          actorUserId: principal.userId,
          actorRole: principal.role,
          source: context.source,
          requestId: context.requestId,
          actionType: "RECIPIENT_DELETED",
          outcome: ActivityOutcome.SUCCESS,
          entityType: "Recipient",
          entityId: id,
          metadata: {}
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        throw new PublicApiError(
          409,
          "RECIPIENT_IN_USE",
          "Recipient is used by a transfer request"
        );
      }
      throw error;
    }
  }

  async listSenderTransfers(principal: AuthPrincipal, limit: number) {
    requireSender(principal);
    const transfers = await this.database.transferRequest.findMany({
      where: { senderId: principal.userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit
    });
    return transfers.map(transferProjection);
  }

  async createTransfer(
    principal: AuthPrincipal,
    input: TransferInput,
    context: RequestContext
  ) {
    requireSender(principal);
    const amount = BigInt(input.sendAmountMinor);
    if (amount < 1n || amount > MAX_POSTGRES_BIGINT) {
      throw new PublicApiError(400, "INVALID_AMOUNT", "Send amount is invalid");
    }
    if (!this.corridorFor(input)) {
      throw new PublicApiError(
        400,
        "UNSUPPORTED_CORRIDOR",
        "Origin, destination, currency, or payout method is not supported"
      );
    }
    const recipient = await this.database.recipient.findUnique({
      where: {
        id_ownerSenderId: { id: input.recipientId, ownerSenderId: principal.userId }
      }
    });
    if (!recipient) {
      await this.auditDenied(principal, context, "Recipient", input.recipientId);
      throw new PublicApiError(404, "RECIPIENT_NOT_FOUND", "Recipient not found");
    }
    if (
      recipient.country !== input.destinationCountry ||
      recipient.payoutMethod !== input.requestedPayoutMethod
    ) {
      throw new PublicApiError(
        400,
        "RECIPIENT_TRANSFER_MISMATCH",
        "Recipient does not match the requested destination and payout method"
      );
    }
    const now = this.clock();
    const quoteDueAt = new Date(now.getTime() + this.config.quoteSlaMinutes * 60_000);
    const recipientSnapshot = {
      id: recipient.id,
      fullName: recipient.fullName,
      country: recipient.country,
      phone: recipient.phone,
      payoutMethod: recipient.payoutMethod,
      payoutDetails: recipient.payoutDetails,
      address: recipient.address
    } satisfies Prisma.InputJsonObject;
    let transfer;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        transfer = await this.database.$transaction(async (transaction) => {
          const created = await transaction.transferRequest.create({
            data: {
              reference: this.referenceFactory(now),
              senderId: principal.userId,
              recipientId: recipient.id,
              originCountry: input.originCountry,
              destinationCountry: input.destinationCountry,
              sendAmountMinor: amount,
              sendCurrency: input.sendCurrency,
              requestedPayoutMethod: input.requestedPayoutMethod,
              recipientSnapshot,
              status: TransferStatus.REQUESTED,
              quoteDueAt,
              senderNote: input.senderNote ?? null,
              createdAt: now
            }
          });
          await writeActivity(transaction, {
            actorUserId: principal.userId,
            actorRole: principal.role,
            source: context.source,
            requestId: context.requestId,
            actionType: "TRANSFER_REQUEST_CREATED",
            outcome: ActivityOutcome.SUCCESS,
            entityType: "TransferRequest",
            entityId: created.id,
            nextState: { status: TransferStatus.REQUESTED },
            metadata: {
              reference: created.reference,
              originCountry: created.originCountry,
              destinationCountry: created.destinationCountry
            }
          });
          return created;
        });
        break;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002" ||
          attempt === 2
        ) {
          throw error;
        }
      }
    }
    if (!transfer) throw new Error("Transfer reference generation failed");
    return transferProjection(transfer);
  }

  async getSenderTransfer(
    principal: AuthPrincipal,
    id: string,
    context: RequestContext
  ) {
    requireSender(principal);
    const transfer = await this.database.transferRequest.findUnique({
      where: { id_senderId: { id, senderId: principal.userId } }
    });
    if (!transfer) {
      await this.auditDenied(principal, context, "TransferRequest", id);
      throw new PublicApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
    }
    const events = await this.database.activityEvent.findMany({
      where: {
        entityType: "TransferRequest",
        entityId: id,
        actionType: { in: [...SENDER_TIMELINE_ACTIONS] }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { actionType: true, nextState: true, reason: true, createdAt: true }
    });
    return {
      ...transferProjection(transfer),
      timeline: events.map((event) => ({
        type: event.actionType,
        status:
          event.nextState &&
          typeof event.nextState === "object" &&
          !Array.isArray(event.nextState) &&
          typeof event.nextState.status === "string"
            ? event.nextState.status
            : null,
        reason:
          event.actionType === "TRANSFER_REQUEST_INFO_NEEDED" ||
          event.actionType === "TRANSFER_REQUEST_DECLINED" ||
          event.actionType === "TRANSFER_REQUEST_CANCELLED" ||
          event.actionType === "QUOTE_REJECTED" ||
          event.actionType === "FUNDING_PROOF_RESUBMISSION_REQUESTED" ||
          event.actionType === "FUNDING_PROOF_REJECTED"
            ? event.reason
            : null,
        occurredAt: event.createdAt.toISOString()
      }))
    };
  }

  private async transition(
    principal: AuthPrincipal,
    id: string,
    target: TransferStatus,
    reason: string | undefined,
    context: RequestContext,
    senderScoped: boolean
  ) {
    const existing = await this.database.transferRequest.findFirst({
      where: { id, ...(senderScoped ? { senderId: principal.userId } : {}) },
      select: { id: true, status: true }
    });
    if (!existing) {
      await this.auditDenied(principal, context, "TransferRequest", id);
      throw new PublicApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
    }
    try {
      assertTransferTransition(existing.status, target);
    } catch (error) {
      await writeActivity(this.database, {
        actorUserId: principal.userId,
        actorRole: principal.role,
        source: context.source,
        requestId: context.requestId,
        actionType: "TRANSFER_TRANSITION_REJECTED",
        outcome: ActivityOutcome.FAILURE,
        entityType: "TransferRequest",
        entityId: id,
        previousState: { status: existing.status },
        nextState: { requestedStatus: target },
        errorCode: "INVALID_TRANSFER_TRANSITION",
        metadata: {}
      });
      throw error;
    }
    const updated = await this.database.$transaction(async (transaction) => {
      const result = await transaction.transferRequest.updateMany({
        where: {
          id,
          status: existing.status,
          ...(senderScoped ? { senderId: principal.userId } : {})
        },
        data: { status: target }
      });
      if (result.count !== 1) {
        throw new PublicApiError(
          409,
          "TRANSFER_CHANGED",
          "Transfer changed while the action was being applied"
        );
      }
      if (target === TransferStatus.CANCELLED) {
        await transaction.quote.updateMany({
          where: { transferRequestId: id, status: QuoteStatus.SENT },
          data: { status: QuoteStatus.SUPERSEDED }
        });
      }
      await writeActivity(transaction, {
        actorUserId: principal.userId,
        actorRole: principal.role,
        source: context.source,
        requestId: context.requestId,
        actionType: stateActionName(target),
        outcome: ActivityOutcome.SUCCESS,
        entityType: "TransferRequest",
        entityId: id,
        previousState: { status: existing.status },
        nextState: { status: target },
        reason,
        metadata: {}
      });
      return transaction.transferRequest.findUniqueOrThrow({ where: { id } });
    });
    return transferProjection(updated);
  }

  async cancelSenderTransfer(
    principal: AuthPrincipal,
    id: string,
    reason: string | undefined,
    context: RequestContext
  ) {
    requireSender(principal);
    return this.transition(
      principal,
      id,
      TransferStatus.CANCELLED,
      reason,
      context,
      true
    );
  }

  async listOperationsRequests(principal: AuthPrincipal, limit: number) {
    requireOperations(principal);
    const transfers = await this.database.transferRequest.findMany({
      where: {
        status: {
          in: [
            TransferStatus.REQUESTED,
            TransferStatus.NEEDS_INFO,
            TransferStatus.QUOTING,
            TransferStatus.QUOTED,
            TransferStatus.QUOTE_ACCEPTED,
            TransferStatus.FUNDING_PENDING,
            TransferStatus.FUNDING_SUBMITTED,
            TransferStatus.FUNDS_CONFIRMED,
            TransferStatus.PAYOUT_IN_PROGRESS,
            TransferStatus.PAYOUT_REPORTED,
            TransferStatus.CONFIRMATION_PENDING,
            TransferStatus.ON_HOLD,
            TransferStatus.DISPUTED,
            TransferStatus.REFUND_PENDING
          ]
        }
      },
      orderBy: [{ quoteDueAt: "asc" }, { id: "asc" }],
      take: limit,
      include: {
        sender: { select: { id: true, fullName: true } }
      }
    });
    return transfers.map(queueProjection);
  }

  async getOperationsRequest(principal: AuthPrincipal, id: string) {
    requireOperations(principal);
    const transfer = await this.database.transferRequest.findUnique({
      where: { id },
      include: { sender: { select: { id: true, fullName: true, email: true } } }
    });
    if (!transfer) {
      throw new PublicApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
    }
    return { ...transferProjection(transfer), sender: transfer.sender };
  }

  async reviewRequest(
    principal: AuthPrincipal,
    id: string,
    action: RequestReviewAction,
    reason: string | undefined,
    context: RequestContext
  ) {
    requireOperations(principal);
    return this.transition(
      principal,
      id,
      reviewActionTarget(action),
      reason,
      context,
      false
    );
  }
}
