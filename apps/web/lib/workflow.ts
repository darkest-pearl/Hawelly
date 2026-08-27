import type { TransferTone } from "./milestone-2-fixtures";

export type PayoutMethod =
  | "BANK_TRANSFER"
  | "CASH_PICKUP"
  | "MOBILE_MONEY"
  | "OTHER";

export interface RecipientRecord {
  id: string;
  fullName: string;
  country: string;
  phone: string | null;
  payoutMethod: PayoutMethod;
  payoutDetails: Record<string, unknown>;
  address: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransferRecord {
  id: string;
  reference: string;
  recipientId: string;
  originCountry: string;
  destinationCountry: string;
  sendAmountMinor: string;
  sendCurrency: string;
  requestedPayoutMethod: PayoutMethod;
  recipient: Record<string, unknown>;
  status: string;
  quoteDueAt: string;
  senderNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransferTimelineItem {
  type: string;
  status: string | null;
  reason: string | null;
  occurredAt: string;
}

export interface QuoteRecord {
  id: string;
  transferRequestId: string;
  version: number;
  sendAmountMinor: string;
  sendCurrency: string;
  feeAmountMinor: string;
  feeBreakdown: Record<string, string> | null;
  effectiveRate: string;
  receiveAmountMinor: string;
  receiveCurrency: string;
  expectedDeliveryAt: string;
  expiresAt: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "SUPERSEDED";
  senderFacingNote: string | null;
  createdAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
}

export interface FundingTemplateRecord {
  id: string;
  name: string;
  method: "BANK_TRANSFER" | "CASH_HANDOFF" | "OTHER";
  currency: string;
  payeeName: string;
  provider: string | null;
  accountReference: string | null;
  instructions: string;
}

export interface FundingInstructionRecord {
  id: string;
  transferRequestId: string;
  acceptedQuoteId: string;
  method: FundingTemplateRecord["method"];
  amountMinor: string;
  currency: string;
  payeeName: string;
  provider: string | null;
  accountReference: string | null;
  senderReference: string;
  instructions: string;
  validUntil: string | null;
  createdAt: string;
}

export interface FundingProofRecord {
  id: string;
  transferRequestId: string;
  reference: string | null;
  amountMinor: string | null;
  currency: string | null;
  transferredAt: string | null;
  hasAttachment: boolean;
  originalFilename: string | null;
  contentType: string | null;
  sizeBytes: string | null;
  uploadExpiresAt: string | null;
  uploadedAt: string | null;
  status: "PENDING_UPLOAD" | "SUBMITTED" | "NEEDS_RESUBMISSION" | "VERIFIED" | "REJECTED";
  senderNote: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  createdAt: string;
}

export interface FundingState {
  transferStatus: string;
  instruction: FundingInstructionRecord | null;
  proofs: FundingProofRecord[];
}

export const payoutMethodLabels: Record<PayoutMethod, string> = {
  BANK_TRANSFER: "Bank transfer",
  CASH_PICKUP: "Cash pickup",
  MOBILE_MONEY: "Mobile money",
  OTHER: "Other"
};

export function formatMinorAmount(value: string, currency: string) {
  const amount = BigInt(value);
  const whole = amount / 100n;
  const fraction = (amount % 100n).toString().padStart(2, "0");
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${currency} ${grouped}.${fraction}`;
}

export function majorToMinor(value: string) {
  const normalized = value.trim().replaceAll(",", "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole = "0", fraction = ""] = normalized.split(".");
  const minor = `${whole}${fraction.padEnd(2, "0")}`.replace(/^0+(?=\d)/, "");
  const parsed = BigInt(minor || "0");
  return parsed > 0n ? parsed.toString() : null;
}

export function transferStatus(status: string): {
  label: string;
  tone: TransferTone;
} {
  const labels: Record<string, string> = {
    REQUESTED: "Quote requested",
    NEEDS_INFO: "Needs information",
    QUOTING: "Quote in progress",
    QUOTED: "Quote ready",
    QUOTE_ACCEPTED: "Quote accepted",
    FUNDING_PENDING: "Funding needed",
    FUNDING_SUBMITTED: "Funding under review",
    FUNDS_CONFIRMED: "Funds confirmed",
    SUBMITTED: "Funding proof submitted",
    NEEDS_RESUBMISSION: "Funding proof needs resubmission",
    VERIFIED: "Funding proof verified",
    REJECTED: "Funding proof rejected",
    QUOTE_EXPIRED: "Quote expired",
    DECLINED: "Declined",
    CANCELLED: "Cancelled"
  };
  const tone: TransferTone =
    status === "DECLINED" || status === "CANCELLED" || status === "QUOTE_EXPIRED"
      ? "neutral"
      : status === "NEEDS_INFO"
        ? "warning"
        : "info";
  return {
    label: labels[status] || status.toLowerCase().replaceAll("_", " "),
    tone
  };
}

export function recipientName(transfer: TransferRecord) {
  return typeof transfer.recipient.fullName === "string"
    ? transfer.recipient.fullName
    : "Recipient";
}
