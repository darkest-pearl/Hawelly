import { TransferStatus } from "../generated/prisma/enums.js";
import { PublicApiError } from "../http/errors.js";

export const transferTransitions: Readonly<Record<TransferStatus, readonly TransferStatus[]>> = {
  REQUESTED: [
    TransferStatus.NEEDS_INFO,
    TransferStatus.QUOTING,
    TransferStatus.DECLINED,
    TransferStatus.CANCELLED
  ],
  NEEDS_INFO: [
    TransferStatus.REQUESTED,
    TransferStatus.QUOTING,
    TransferStatus.CANCELLED,
    TransferStatus.DECLINED
  ],
  QUOTING: [
    TransferStatus.QUOTED,
    TransferStatus.NEEDS_INFO,
    TransferStatus.DECLINED,
    TransferStatus.CANCELLED
  ],
  QUOTED: [
    TransferStatus.QUOTE_ACCEPTED,
    TransferStatus.QUOTE_EXPIRED,
    TransferStatus.QUOTING,
    TransferStatus.CANCELLED
  ],
  QUOTE_ACCEPTED: [
    TransferStatus.FUNDING_PENDING,
    TransferStatus.ON_HOLD,
    TransferStatus.CANCELLED
  ],
  FUNDING_PENDING: [
    TransferStatus.FUNDING_SUBMITTED,
    TransferStatus.ON_HOLD,
    TransferStatus.CANCELLED
  ],
  FUNDING_SUBMITTED: [
    TransferStatus.FUNDING_PENDING,
    TransferStatus.FUNDS_CONFIRMED,
    TransferStatus.ON_HOLD
  ],
  FUNDS_CONFIRMED: [
    TransferStatus.PAYOUT_IN_PROGRESS,
    TransferStatus.ON_HOLD,
    TransferStatus.REFUND_PENDING
  ],
  PAYOUT_IN_PROGRESS: [
    TransferStatus.PAYOUT_REPORTED,
    TransferStatus.ON_HOLD,
    TransferStatus.DISPUTED,
    TransferStatus.FAILED
  ],
  PAYOUT_REPORTED: [
    TransferStatus.CONFIRMATION_PENDING,
    TransferStatus.COMPLETED,
    TransferStatus.DISPUTED
  ],
  CONFIRMATION_PENDING: [TransferStatus.COMPLETED, TransferStatus.DISPUTED],
  ON_HOLD: [
    TransferStatus.CANCELLED,
    TransferStatus.REFUND_PENDING,
    TransferStatus.DISPUTED
  ],
  DISPUTED: [
    TransferStatus.PAYOUT_IN_PROGRESS,
    TransferStatus.CONFIRMATION_PENDING,
    TransferStatus.REFUND_PENDING,
    TransferStatus.COMPLETED,
    TransferStatus.FAILED
  ],
  REFUND_PENDING: [TransferStatus.REFUNDED, TransferStatus.FAILED],
  QUOTE_EXPIRED: [],
  CANCELLED: [],
  DECLINED: [],
  COMPLETED: [],
  REFUNDED: [],
  FAILED: []
};

export function assertTransferTransition(from: TransferStatus, to: TransferStatus) {
  if (!transferTransitions[from].includes(to)) {
    throw new PublicApiError(
      409,
      "INVALID_TRANSFER_TRANSITION",
      "Transfer status does not allow this action"
    );
  }
}

export type RequestReviewAction = "REQUEST_INFO" | "START_QUOTING" | "DECLINE";

export function reviewActionTarget(action: RequestReviewAction): TransferStatus {
  if (action === "REQUEST_INFO") return TransferStatus.NEEDS_INFO;
  if (action === "START_QUOTING") return TransferStatus.QUOTING;
  return TransferStatus.DECLINED;
}

