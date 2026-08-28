import {
  ActivityOutcome,
  Capability,
  ConfirmationSource,
  DisputeResolutionAction,
  DisputeStatus,
  PayoutCaseStatus,
  RefundStatus,
  Role,
  TransferStatus,
} from "../generated/prisma/enums.js";
import { writeActivity } from "../auth/audit.js";
import type { AuthPrincipal } from "../auth/service.js";
import type { HawellyPrismaClient } from "../db/prisma.js";
import { PublicApiError } from "../http/errors.js";
import type { RequestContext } from "../middleware/requestContext.js";
import { assertTransferTransition } from "../transfers/state.js";

function requireSender(principal: AuthPrincipal) {
  if (principal.role !== Role.SENDER) throw new PublicApiError(403, "FORBIDDEN", "Forbidden");
}

function requireOperations(principal: AuthPrincipal) {
  if (principal.role !== Role.STAFF && principal.role !== Role.ADMIN) throw new PublicApiError(403, "FORBIDDEN", "Forbidden");
}

function requireAdmin(principal: AuthPrincipal) {
  if (principal.role !== Role.ADMIN) throw new PublicApiError(403, "ADMIN_CONFIRMATION_REQUIRED", "Administrator confirmation is required");
}

function hasCapability(principal: AuthPrincipal, capability: Capability) {
  return principal.role === Role.ADMIN || (principal.role === Role.STAFF && principal.capabilities.includes(capability));
}

function confirmationProjection(item: { id: string; source: ConfirmationSource; note: string | null; confirmedAt: Date }) {
  return { id: item.id, source: item.source, note: item.note, confirmedAt: item.confirmedAt.toISOString() };
}

function disputeProjection(item: {
  id: string; category: string; reason: string; previousTransferStatus: TransferStatus; status: DisputeStatus;
  resolutionAction: DisputeResolutionAction | null; resolution: string | null; openedAt: Date; resolvedAt: Date | null;
}, operations: boolean) {
  return {
    id: item.id, category: item.category, previousTransferStatus: item.previousTransferStatus,
    status: item.status, resolutionAction: item.resolutionAction,
    ...(operations ? { reason: item.reason, resolution: item.resolution } : {}),
    openedAt: item.openedAt.toISOString(), resolvedAt: item.resolvedAt?.toISOString() ?? null
  };
}

function refundProjection(item: {
  id: string; amountMinor: bigint; currency: string; status: RefundStatus; senderFacingReason: string;
  reason: string; externalReference: string | null; initiatedAt: Date; refundedAt: Date | null;
}, operations: boolean) {
  return {
    id: item.id, amountMinor: item.amountMinor.toString(), currency: item.currency, status: item.status,
    senderFacingReason: item.senderFacingReason,
    ...(operations ? { reason: item.reason, externalReference: item.externalReference } : {}),
    initiatedAt: item.initiatedAt.toISOString(), refundedAt: item.refundedAt?.toISOString() ?? null
  };
}

const disputableStates = [TransferStatus.PAYOUT_IN_PROGRESS, TransferStatus.PAYOUT_REPORTED, TransferStatus.CONFIRMATION_PENDING] as const;

export class ResolutionWorkflowService {
  constructor(private readonly database: HawellyPrismaClient, private readonly clock: () => Date = () => new Date()) {}

  async auditCapabilityDenied(principal: AuthPrincipal, capability: Capability, context: RequestContext) {
    await writeActivity(this.database, { actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId, actionType: "AUTHORIZATION_DENIED", outcome: ActivityOutcome.DENIED, entityType: "Capability", entityId: capability, errorCode: "FORBIDDEN" });
  }

  async getSenderState(principal: AuthPrincipal, transferId: string) {
    requireSender(principal);
    const transfer = await this.database.transferRequest.findUnique({
      where: { id_senderId: { id: transferId, senderId: principal.userId } },
      include: { confirmations: { orderBy: { confirmedAt: "asc" } }, disputes: { orderBy: { openedAt: "desc" } }, refundCase: true }
    });
    if (!transfer) throw new PublicApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
    return { transferStatus: transfer.status, confirmations: transfer.confirmations.map(confirmationProjection), disputes: transfer.disputes.map((item) => disputeProjection(item, false)), refund: transfer.refundCase ? refundProjection(transfer.refundCase, false) : null };
  }

  async getOperationsState(principal: AuthPrincipal, transferId: string) {
    requireOperations(principal);
    const transfer = await this.database.transferRequest.findUnique({ where: { id: transferId }, include: { confirmations: { orderBy: { confirmedAt: "asc" } }, disputes: { orderBy: { openedAt: "desc" } }, refundCase: true } });
    if (!transfer) throw new PublicApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
    return { transferStatus: transfer.status, confirmations: transfer.confirmations.map(confirmationProjection), disputes: transfer.disputes.map((item) => disputeProjection(item, true)), refund: transfer.refundCase ? refundProjection(transfer.refundCase, true) : null };
  }

  async requestSenderConfirmation(principal: AuthPrincipal, transferId: string, note: string | undefined, context: RequestContext) {
    requireOperations(principal);
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id: transferId }, include: { confirmations: true, payoutCase: true } });
      if (!transfer || transfer.status !== TransferStatus.PAYOUT_REPORTED || transfer.payoutCase?.status !== PayoutCaseStatus.REPORTED || !transfer.confirmations.some((item) => item.source === ConfirmationSource.STAFF)) throw new PublicApiError(409, "CONFIRMATION_NOT_READY", "Transfer is not ready for sender confirmation");
      assertTransferTransition(transfer.status, TransferStatus.CONFIRMATION_PENDING);
      await transaction.transferRequest.update({ where: { id: transfer.id }, data: { status: TransferStatus.CONFIRMATION_PENDING } });
      await writeActivity(transaction, { actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId, actionType: "RECIPIENT_CONFIRMATION_REQUESTED", outcome: ActivityOutcome.SUCCESS, entityType: "TransferRequest", entityId: transfer.id, previousState: { status: TransferStatus.PAYOUT_REPORTED }, nextState: { status: TransferStatus.CONFIRMATION_PENDING }, reason: note, metadata: {} });
      return { transferStatus: TransferStatus.CONFIRMATION_PENDING };
    });
  }

  async confirmRecipientReceived(principal: AuthPrincipal, transferId: string, note: string | undefined, context: RequestContext) {
    requireSender(principal);
    const now = this.clock();
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid AND "senderId" = ${principal.userId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id_senderId: { id: transferId, senderId: principal.userId } }, include: { confirmations: true, payoutCase: true } });
      if (!transfer) throw new PublicApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
      if (transfer.status !== TransferStatus.CONFIRMATION_PENDING || transfer.payoutCase?.status !== PayoutCaseStatus.REPORTED || !transfer.confirmations.some((item) => item.source === ConfirmationSource.STAFF)) throw new PublicApiError(409, "SENDER_CONFIRMATION_NOT_ALLOWED", "Transfer is not awaiting sender confirmation");
      await transaction.transferConfirmation.create({ data: { transferRequestId: transfer.id, source: ConfirmationSource.SENDER, actorUserId: principal.userId, note: note ?? null, confirmedAt: now } });
      assertTransferTransition(transfer.status, TransferStatus.COMPLETED);
      await transaction.transferRequest.update({ where: { id: transfer.id }, data: { status: TransferStatus.COMPLETED } });
      await transaction.payoutCase.update({ where: { id: transfer.payoutCase.id }, data: { status: PayoutCaseStatus.COMPLETED } });
      await writeActivity(transaction, { actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId, actionType: "RECIPIENT_RECEIPT_CONFIRMED", outcome: ActivityOutcome.SUCCESS, entityType: "TransferRequest", entityId: transfer.id, previousState: { status: TransferStatus.CONFIRMATION_PENDING }, nextState: { status: TransferStatus.COMPLETED }, reason: note, metadata: { source: ConfirmationSource.SENDER } });
      return { transferStatus: TransferStatus.COMPLETED };
    });
  }

  async completeByAdmin(principal: AuthPrincipal, transferId: string, reason: string, context: RequestContext) {
    requireOperations(principal); requireAdmin(principal);
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id: transferId }, include: { confirmations: true, payoutCase: true } });
      if (!transfer || (transfer.status !== TransferStatus.PAYOUT_REPORTED && transfer.status !== TransferStatus.CONFIRMATION_PENDING) || transfer.payoutCase?.status !== PayoutCaseStatus.REPORTED || !transfer.confirmations.some((item) => item.source === ConfirmationSource.STAFF)) throw new PublicApiError(409, "ADMIN_COMPLETION_NOT_ALLOWED", "Transfer cannot be completed in this state");
      assertTransferTransition(transfer.status, TransferStatus.COMPLETED);
      await transaction.transferRequest.update({ where: { id: transfer.id }, data: { status: TransferStatus.COMPLETED } });
      await transaction.payoutCase.update({ where: { id: transfer.payoutCase.id }, data: { status: PayoutCaseStatus.COMPLETED } });
      await writeActivity(transaction, { actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId, actionType: "TRANSFER_COMPLETED_BY_ADMIN", outcome: ActivityOutcome.SUCCESS, entityType: "TransferRequest", entityId: transfer.id, previousState: { status: transfer.status }, nextState: { status: TransferStatus.COMPLETED }, reason, metadata: { confirmations: transfer.confirmations.map((item) => item.source) } });
      return { transferStatus: TransferStatus.COMPLETED };
    });
  }

  async openDispute(principal: AuthPrincipal, transferId: string, category: string, reason: string, context: RequestContext, senderScoped: boolean) {
    if (senderScoped) requireSender(principal); else requireOperations(principal);
    const now = this.clock();
    const dispute = await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findFirst({ where: { id: transferId, ...(senderScoped ? { senderId: principal.userId } : {}) }, include: { payoutCase: true } });
      if (!transfer) throw new PublicApiError(404, "TRANSFER_NOT_FOUND", "Transfer not found");
      if (!disputableStates.includes(transfer.status as typeof disputableStates[number])) throw new PublicApiError(409, "DISPUTE_NOT_ALLOWED", "A dispute cannot be opened in this state");
      const created = await transaction.dispute.create({ data: { transferRequestId: transfer.id, openedByUserId: principal.userId, category, reason, previousTransferStatus: transfer.status, openedAt: now } });
      assertTransferTransition(transfer.status, TransferStatus.DISPUTED);
      await transaction.transferRequest.update({ where: { id: transfer.id }, data: { status: TransferStatus.DISPUTED } });
      if (transfer.payoutCase?.status === PayoutCaseStatus.IN_PROGRESS) await transaction.payoutCase.update({ where: { id: transfer.payoutCase.id }, data: { status: PayoutCaseStatus.ON_HOLD } });
      await writeActivity(transaction, { actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId, actionType: "DISPUTE_OPENED", outcome: ActivityOutcome.SUCCESS, entityType: "TransferRequest", entityId: transfer.id, previousState: { status: transfer.status }, nextState: { status: TransferStatus.DISPUTED }, reason, metadata: { disputeId: created.id, category } });
      return created;
    });
    return disputeProjection(dispute, !senderScoped);
  }

  async takeDispute(principal: AuthPrincipal, transferId: string, disputeId: string, context: RequestContext) {
    requireOperations(principal);
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid FOR UPDATE`;
      const claimed = await transaction.dispute.updateMany({ where: { id: disputeId, transferRequestId: transferId, status: DisputeStatus.OPEN }, data: { status: DisputeStatus.IN_REVIEW, assignedToStaffId: principal.userId } });
      if (claimed.count !== 1) throw new PublicApiError(404, "DISPUTE_NOT_FOUND", "Open dispute not found");
      const updated = await transaction.dispute.findUniqueOrThrow({ where: { id: disputeId } });
      await writeActivity(transaction, { actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId, actionType: "DISPUTE_REVIEW_STARTED", outcome: ActivityOutcome.SUCCESS, entityType: "Dispute", entityId: disputeId, previousState: { status: DisputeStatus.OPEN }, nextState: { status: updated.status }, metadata: { transferRequestId: transferId } });
      return disputeProjection(updated, true);
    });
  }

  private async createRefund(transaction: HawellyPrismaClient, transfer: { id: string; acceptedQuote: { sendAmountMinor: bigint; sendCurrency: string } | null }, principal: AuthPrincipal, reason: string, senderFacingReason: string) {
    if (!transfer.acceptedQuote) throw new PublicApiError(409, "REFUND_SNAPSHOT_UNAVAILABLE", "Accepted quote snapshot is unavailable for refund");
    return transaction.refundCase.create({ data: { transferRequestId: transfer.id, amountMinor: transfer.acceptedQuote.sendAmountMinor, currency: transfer.acceptedQuote.sendCurrency, reason, senderFacingReason, initiatedByStaffId: principal.userId, initiatedAt: this.clock() } });
  }

  async resolveDispute(principal: AuthPrincipal, transferId: string, disputeId: string, action: DisputeResolutionAction, resolution: string, senderFacingReason: string | undefined, context: RequestContext) {
    requireOperations(principal);
    if (action === DisputeResolutionAction.COMPLETE || action === DisputeResolutionAction.FAIL) requireAdmin(principal);
    if (action === DisputeResolutionAction.REFUND && !hasCapability(principal, Capability.REFUND_MANAGE)) {
      await this.auditCapabilityDenied(principal, Capability.REFUND_MANAGE, context);
      throw new PublicApiError(403, "FORBIDDEN", "Forbidden");
    }
    const now = this.clock();
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid FOR UPDATE`;
      await transaction.$queryRaw`SELECT "id" FROM "Dispute" WHERE "id" = ${disputeId}::uuid AND "transferRequestId" = ${transferId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id: transferId }, include: { payoutCase: true, acceptedQuote: true, confirmations: true } });
      const dispute = await transaction.dispute.findFirst({ where: { id: disputeId, transferRequestId: transferId, status: { in: [DisputeStatus.OPEN, DisputeStatus.IN_REVIEW] } } });
      if (!transfer || !dispute || transfer.status !== TransferStatus.DISPUTED) throw new PublicApiError(404, "DISPUTE_NOT_FOUND", "Active dispute not found");
      if ((action === DisputeResolutionAction.RESUME || action === DisputeResolutionAction.REJECT) && !dispute.previousTransferStatusVerified) throw new PublicApiError(409, "DISPUTE_RESUME_UNSAFE", "The prior transfer state could not be verified; choose an explicit terminal resolution");
      let target: TransferStatus;
      if (action === DisputeResolutionAction.REFUND) target = TransferStatus.REFUND_PENDING;
      else if (action === DisputeResolutionAction.COMPLETE) target = TransferStatus.COMPLETED;
      else if (action === DisputeResolutionAction.FAIL) target = TransferStatus.FAILED;
      else target = dispute.previousTransferStatus === TransferStatus.PAYOUT_IN_PROGRESS ? TransferStatus.PAYOUT_IN_PROGRESS : TransferStatus.CONFIRMATION_PENDING;
      if (target === TransferStatus.COMPLETED && (!transfer.confirmations.some((item) => item.source === ConfirmationSource.STAFF) || transfer.payoutCase?.status !== PayoutCaseStatus.REPORTED)) throw new PublicApiError(409, "ADMIN_COMPLETION_NOT_ALLOWED", "Payout evidence is not sufficient for completion");
      assertTransferTransition(transfer.status, target);
      if (action === DisputeResolutionAction.REFUND) await this.createRefund(transaction as HawellyPrismaClient, transfer, principal, resolution, senderFacingReason ?? "A refund is being processed.");
      if (transfer.payoutCase?.status === PayoutCaseStatus.ON_HOLD) await transaction.payoutCase.update({ where: { id: transfer.payoutCase.id }, data: { status: target === TransferStatus.PAYOUT_IN_PROGRESS ? PayoutCaseStatus.IN_PROGRESS : target === TransferStatus.COMPLETED ? PayoutCaseStatus.COMPLETED : PayoutCaseStatus.FAILED } });
      else if (transfer.payoutCase?.status === PayoutCaseStatus.REPORTED && target === TransferStatus.COMPLETED) await transaction.payoutCase.update({ where: { id: transfer.payoutCase.id }, data: { status: PayoutCaseStatus.COMPLETED } });
      else if (transfer.payoutCase?.status === PayoutCaseStatus.REPORTED && (target === TransferStatus.REFUND_PENDING || target === TransferStatus.FAILED)) await transaction.payoutCase.update({ where: { id: transfer.payoutCase.id }, data: { status: PayoutCaseStatus.FAILED } });
      await transaction.transferRequest.update({ where: { id: transfer.id }, data: { status: target } });
      const updated = await transaction.dispute.update({ where: { id: dispute.id }, data: { status: action === DisputeResolutionAction.REJECT ? DisputeStatus.REJECTED : DisputeStatus.RESOLVED, resolutionAction: action, resolution, assignedToStaffId: dispute.assignedToStaffId ?? principal.userId, resolvedAt: now } });
      await writeActivity(transaction, { actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId, actionType: "DISPUTE_RESOLVED", outcome: ActivityOutcome.SUCCESS, entityType: "TransferRequest", entityId: transfer.id, previousState: { status: TransferStatus.DISPUTED }, nextState: { status: target }, reason: resolution, metadata: { disputeId: dispute.id, action } });
      return { transferStatus: target, dispute: disputeProjection(updated, true) };
    });
  }

  async startRefund(principal: AuthPrincipal, transferId: string, reason: string, senderFacingReason: string, context: RequestContext) {
    requireOperations(principal);
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id: transferId }, include: { acceptedQuote: true, payoutCase: true, refundCase: true } });
      if (!transfer || transfer.refundCase || (transfer.status !== TransferStatus.FUNDS_CONFIRMED && transfer.status !== TransferStatus.ON_HOLD)) throw new PublicApiError(409, "REFUND_NOT_ALLOWED", "Refund cannot be started in this state");
      const refund = await this.createRefund(transaction as HawellyPrismaClient, transfer, principal, reason, senderFacingReason);
      assertTransferTransition(transfer.status, TransferStatus.REFUND_PENDING);
      if (transfer.payoutCase?.status === PayoutCaseStatus.ON_HOLD) await transaction.payoutCase.update({ where: { id: transfer.payoutCase.id }, data: { status: PayoutCaseStatus.FAILED } });
      await transaction.transferRequest.update({ where: { id: transfer.id }, data: { status: TransferStatus.REFUND_PENDING } });
      await writeActivity(transaction, { actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId, actionType: "REFUND_STARTED", outcome: ActivityOutcome.SUCCESS, entityType: "TransferRequest", entityId: transfer.id, previousState: { status: transfer.status }, nextState: { status: TransferStatus.REFUND_PENDING }, reason, metadata: { refundCaseId: refund.id, amountMinor: refund.amountMinor.toString(), currency: refund.currency } });
      return { transferStatus: TransferStatus.REFUND_PENDING, refund: refundProjection(refund, true) };
    });
  }

  async confirmRefund(principal: AuthPrincipal, transferId: string, externalReference: string, refundedAtValue: string, reason: string, context: RequestContext) {
    requireOperations(principal); requireAdmin(principal);
    const now = this.clock(); const refundedAt = new Date(refundedAtValue);
    if (refundedAt > new Date(now.getTime() + 5 * 60_000)) throw new PublicApiError(400, "INVALID_REFUND_TIME", "Refund time is invalid");
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "TransferRequest" WHERE "id" = ${transferId}::uuid FOR UPDATE`;
      const transfer = await transaction.transferRequest.findUnique({ where: { id: transferId }, include: { refundCase: true } });
      if (!transfer?.refundCase || transfer.status !== TransferStatus.REFUND_PENDING || transfer.refundCase.status !== RefundStatus.PENDING || refundedAt < transfer.refundCase.initiatedAt) throw new PublicApiError(409, "REFUND_CONFIRMATION_NOT_ALLOWED", "Refund cannot be confirmed in this state");
      const refund = await transaction.refundCase.update({ where: { id: transfer.refundCase.id }, data: { status: RefundStatus.REFUNDED, externalReference, confirmedByAdminId: principal.userId, refundedAt } });
      assertTransferTransition(transfer.status, TransferStatus.REFUNDED);
      await transaction.transferRequest.update({ where: { id: transfer.id }, data: { status: TransferStatus.REFUNDED } });
      await writeActivity(transaction, { actorUserId: principal.userId, actorRole: principal.role, source: context.source, requestId: context.requestId, actionType: "REFUND_CONFIRMED", outcome: ActivityOutcome.SUCCESS, entityType: "TransferRequest", entityId: transfer.id, previousState: { status: TransferStatus.REFUND_PENDING }, nextState: { status: TransferStatus.REFUNDED }, reason, metadata: { refundCaseId: refund.id, externalReference } });
      return { transferStatus: TransferStatus.REFUNDED, refund: refundProjection(refund, true) };
    });
  }
}
