import { Prisma } from "../generated/prisma/client.js";
import {
  ActivityOutcome,
  ActivitySource,
  QuoteStatus,
  Role,
  TransferStatus
} from "../generated/prisma/enums.js";
import type { Capability } from "../generated/prisma/enums.js";
import { writeActivity } from "../auth/audit.js";
import type { AuthPrincipal } from "../auth/service.js";
import type { HawellyPrismaClient } from "../db/prisma.js";
import { PublicApiError } from "../http/errors.js";
import type { RequestContext } from "../middleware/requestContext.js";
import { assertTransferTransition } from "../transfers/state.js";
import type { QuoteWorkflowConfig } from "./config.js";

const MAX_BIGINT = 9_223_372_036_854_775_807n;

export interface QuoteDraftInput {
  sendAmountMinor: string;
  sendCurrency: string;
  feeAmountMinor: string;
  feeBreakdown?: Record<string, string> | undefined;
  effectiveRate: string;
  receiveAmountMinor: string;
  receiveCurrency: string;
  expectedDeliveryAt: string;
  validForMinutes?: number | undefined;
  senderFacingNote?: string | undefined;
  internalNote?: string | undefined;
}

function requireOperations(principal: AuthPrincipal) {
  if (principal.role !== Role.STAFF && principal.role !== Role.ADMIN) {
    throw new PublicApiError(403, "FORBIDDEN", "Forbidden");
  }
}

function requireSender(principal: AuthPrincipal) {
  if (principal.role !== Role.SENDER) {
    throw new PublicApiError(403, "FORBIDDEN", "Forbidden");
  }
}

function quoteProjection(quote: {
  id: string;
  transferRequestId: string;
  version: number;
  sendAmountMinor: bigint;
  sendCurrency: string;
  feeAmountMinor: bigint;
  feeBreakdown: unknown;
  effectiveRate: Prisma.Decimal;
  receiveAmountMinor: bigint;
  receiveCurrency: string;
  expectedDeliveryAt: Date;
  expiresAt: Date;
  status: QuoteStatus;
  senderFacingNote: string | null;
  createdAt: Date;
  sentAt: Date | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
}) {
  return {
    id: quote.id,
    transferRequestId: quote.transferRequestId,
    version: quote.version,
    sendAmountMinor: quote.sendAmountMinor.toString(),
    sendCurrency: quote.sendCurrency,
    feeAmountMinor: quote.feeAmountMinor.toString(),
    feeBreakdown: quote.feeBreakdown,
    effectiveRate: quote.effectiveRate.toString(),
    receiveAmountMinor: quote.receiveAmountMinor.toString(),
    receiveCurrency: quote.receiveCurrency,
    expectedDeliveryAt: quote.expectedDeliveryAt.toISOString(),
    expiresAt: quote.expiresAt.toISOString(),
    status: quote.status,
    senderFacingNote: quote.senderFacingNote,
    createdAt: quote.createdAt.toISOString(),
    sentAt: quote.sentAt?.toISOString() ?? null,
    acceptedAt: quote.acceptedAt?.toISOString() ?? null,
    rejectedAt: quote.rejectedAt?.toISOString() ?? null
  };
}

export class QuoteWorkflowService {
  constructor(
    private readonly database: HawellyPrismaClient,
    private readonly config: QuoteWorkflowConfig,
    private readonly clock: () => Date = () => new Date()
  ) {}

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

  async createDraft(principal: AuthPrincipal, transferId: string, input: QuoteDraftInput, context: RequestContext) {
    requireOperations(principal);
    const sendAmount = BigInt(input.sendAmountMinor);
    const feeAmount = BigInt(input.feeAmountMinor);
    const receiveAmount = BigInt(input.receiveAmountMinor);
    if ([sendAmount, feeAmount, receiveAmount].some((value) => value > MAX_BIGINT)) {
      throw new PublicApiError(400, "INVALID_QUOTE_AMOUNT", "Quote amount is invalid");
    }
    const now = this.clock();
    const expectedDeliveryAt = new Date(input.expectedDeliveryAt);
    if (expectedDeliveryAt <= now) {
      throw new PublicApiError(400, "INVALID_DELIVERY_TIME", "Expected delivery must be in the future");
    }
    const expiresAt = new Date(now.getTime() + (input.validForMinutes ?? this.config.defaultExpiryMinutes) * 60_000);

    const quote = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id: transferId } });
      if (!transfer) throw new PublicApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
      if (
        transfer.status !== TransferStatus.QUOTING &&
        transfer.status !== TransferStatus.QUOTED
      ) {
        throw new PublicApiError(409, "TRANSFER_NOT_QUOTABLE", "Transfer is not ready for a quote");
      }
      if (transfer.sendAmountMinor !== sendAmount || transfer.sendCurrency !== input.sendCurrency) {
        throw new PublicApiError(400, "QUOTE_REQUEST_MISMATCH", "Quote send amount and currency must match the request");
      }
      const existingDraft = await transaction.quote.findFirst({ where: { transferRequestId: transferId, status: QuoteStatus.DRAFT }, select: { id: true } });
      if (existingDraft) throw new PublicApiError(409, "QUOTE_DRAFT_EXISTS", "A draft quote already exists");
      const aggregate = await transaction.quote.aggregate({ where: { transferRequestId: transferId }, _max: { version: true } });
      const created = await transaction.quote.create({
        data: {
          transferRequestId: transferId,
          version: (aggregate._max.version ?? 0) + 1,
          sendAmountMinor: sendAmount,
          sendCurrency: input.sendCurrency,
          feeAmountMinor: feeAmount,
          feeBreakdown: input.feeBreakdown ?? Prisma.JsonNull,
          effectiveRate: new Prisma.Decimal(input.effectiveRate),
          receiveAmountMinor: receiveAmount,
          receiveCurrency: input.receiveCurrency,
          expectedDeliveryAt,
          expiresAt,
          createdByStaffId: principal.userId,
          senderFacingNote: input.senderFacingNote ?? null,
          internalNote: input.internalNote ?? null,
          createdAt: now
        }
      });
      await writeActivity(transaction, {
        actorUserId: principal.userId,
        actorRole: principal.role,
        source: context.source,
        requestId: context.requestId,
        actionType: "QUOTE_DRAFT_CREATED",
        outcome: ActivityOutcome.SUCCESS,
        entityType: "Quote",
        entityId: created.id,
        nextState: { status: QuoteStatus.DRAFT },
        metadata: { transferRequestId: transferId, version: created.version }
      });
      return created;
    });
    return quoteProjection(quote);
  }

  async sendDraft(principal: AuthPrincipal, transferId: string, quoteId: string, context: RequestContext) {
    requireOperations(principal);
    const now = this.clock();
    const sent = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id: transferId } });
      const quote = await transaction.quote.findUnique({ where: { id_transferRequestId: { id: quoteId, transferRequestId: transferId } } });
      if (!transfer || !quote) throw new PublicApiError(404, "QUOTE_NOT_FOUND", "Quote not found");
      if (quote.status !== QuoteStatus.DRAFT) throw new PublicApiError(409, "QUOTE_NOT_DRAFT", "Quote is not a draft");
      if (quote.expiresAt <= now) throw new PublicApiError(409, "QUOTE_ALREADY_EXPIRED", "Draft quote has expired");
      if (
        transfer.status !== TransferStatus.QUOTING &&
        transfer.status !== TransferStatus.QUOTED
      ) {
        throw new PublicApiError(409, "TRANSFER_NOT_QUOTABLE", "Transfer is not ready for a quote");
      }
      const superseded = await transaction.quote.updateMany({
        where: { transferRequestId: transferId, status: QuoteStatus.SENT },
        data: { status: QuoteStatus.SUPERSEDED }
      });
      const result = await transaction.quote.update({ where: { id: quoteId }, data: { status: QuoteStatus.SENT, sentAt: now } });
      if (transfer.status === TransferStatus.QUOTING) {
        assertTransferTransition(transfer.status, TransferStatus.QUOTED);
        await transaction.transferRequest.update({ where: { id: transferId }, data: { status: TransferStatus.QUOTED } });
      }
      await writeActivity(transaction, {
        actorUserId: principal.userId,
        actorRole: principal.role,
        source: context.source,
        requestId: context.requestId,
        actionType: "QUOTE_SENT",
        outcome: ActivityOutcome.SUCCESS,
        entityType: "Quote",
        entityId: result.id,
        previousState: { status: QuoteStatus.DRAFT },
        nextState: { status: QuoteStatus.SENT },
        metadata: { transferRequestId: transferId, version: result.version, supersededCount: superseded.count }
      });
      await writeActivity(transaction, {
        source: ActivitySource.SYSTEM,
        requestId: context.requestId,
        actionType: "QUOTE_READY",
        outcome: ActivityOutcome.INFO,
        entityType: "TransferRequest",
        entityId: transferId,
        nextState: { status: TransferStatus.QUOTED },
        metadata: { quoteId: result.id, version: result.version }
      });
      return result;
    });
    return quoteProjection(sent);
  }

  async listOperationsQuotes(principal: AuthPrincipal, transferId: string) {
    requireOperations(principal);
    const transfer = await this.database.transferRequest.findUnique({ where: { id: transferId }, select: { id: true } });
    if (!transfer) throw new PublicApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
    const quotes = await this.database.quote.findMany({ where: { transferRequestId: transferId }, orderBy: { version: "desc" } });
    return quotes.map((quote) => ({ ...quoteProjection(quote), internalNote: quote.internalNote, createdByStaffId: quote.createdByStaffId }));
  }

  private async expireIfNeeded(transferId: string, senderId: string, context: RequestContext) {
    const now = this.clock();
    await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid AND "senderId" = ${senderId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id_senderId: { id: transferId, senderId } } });
      if (!transfer) throw new PublicApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
      const active = await transaction.quote.findFirst({ where: { transferRequestId: transferId, status: QuoteStatus.SENT } });
      if (!active || active.expiresAt > now) return;
      await transaction.quote.update({ where: { id: active.id }, data: { status: QuoteStatus.EXPIRED } });
      if (transfer.status === TransferStatus.QUOTED) {
        assertTransferTransition(transfer.status, TransferStatus.QUOTE_EXPIRED);
        await transaction.transferRequest.update({ where: { id: transferId }, data: { status: TransferStatus.QUOTE_EXPIRED } });
      }
      await writeActivity(transaction, {
        source: ActivitySource.SYSTEM,
        requestId: context.requestId,
        actionType: "QUOTE_EXPIRED",
        outcome: ActivityOutcome.INFO,
        entityType: "TransferRequest",
        entityId: transferId,
        previousState: { status: TransferStatus.QUOTED },
        nextState: { status: TransferStatus.QUOTE_EXPIRED },
        metadata: { transferRequestId: transferId, version: active.version }
      });
    });
  }

  async listSenderQuotes(principal: AuthPrincipal, transferId: string, context: RequestContext) {
    requireSender(principal);
    await this.expireIfNeeded(transferId, principal.userId, context);
    const quotes = await this.database.quote.findMany({
      where: { transferRequestId: transferId, transferRequest: { senderId: principal.userId }, status: { not: QuoteStatus.DRAFT } },
      orderBy: { version: "desc" }
    });
    return quotes.map(quoteProjection);
  }

  async decide(principal: AuthPrincipal, transferId: string, quoteId: string, decision: "ACCEPT" | "REJECT", reason: string | undefined, context: RequestContext) {
    requireSender(principal);
    await this.expireIfNeeded(transferId, principal.userId, context);
    const now = this.clock();
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid AND "senderId" = ${principal.userId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id_senderId: { id: transferId, senderId: principal.userId } } });
      const quote = await transaction.quote.findUnique({ where: { id_transferRequestId: { id: quoteId, transferRequestId: transferId } } });
      if (!transfer || !quote || quote.status === QuoteStatus.DRAFT) throw new PublicApiError(404, "QUOTE_NOT_FOUND", "Quote not found");
      if (quote.status !== QuoteStatus.SENT || transfer.status !== TransferStatus.QUOTED) {
        throw new PublicApiError(409, "QUOTE_NOT_ACTIONABLE", "Quote is not actionable");
      }
      if (quote.expiresAt <= now) throw new PublicApiError(409, "QUOTE_EXPIRED", "Quote has expired");

      const quoteStatus = decision === "ACCEPT" ? QuoteStatus.ACCEPTED : QuoteStatus.REJECTED;
      const transferStatus = decision === "ACCEPT" ? TransferStatus.QUOTE_ACCEPTED : TransferStatus.QUOTING;
      assertTransferTransition(transfer.status, transferStatus);
      const updated = await transaction.quote.update({
        where: { id: quote.id },
        data: decision === "ACCEPT" ? { status: quoteStatus, acceptedAt: now } : { status: quoteStatus, rejectedAt: now }
      });
      await transaction.transferRequest.update({
        where: { id: transfer.id },
        data: decision === "ACCEPT" ? { status: transferStatus, acceptedQuoteId: quote.id } : { status: transferStatus }
      });
      await writeActivity(transaction, {
        actorUserId: principal.userId,
        actorRole: principal.role,
        source: context.source,
        requestId: context.requestId,
        actionType: decision === "ACCEPT" ? "QUOTE_ACCEPTED" : "QUOTE_REJECTED",
        outcome: ActivityOutcome.SUCCESS,
        entityType: "TransferRequest",
        entityId: transferId,
        previousState: { status: TransferStatus.QUOTED },
        nextState: { status: transferStatus },
        reason,
        metadata: { transferRequestId: transferId, version: quote.version, quoteStatus }
      });
      return { quote: quoteProjection(updated), transferStatus };
    });
  }
}
