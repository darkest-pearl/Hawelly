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

export interface TransferCorridorOption {
  originCountry: string;
  destinationCountry: string;
  sendCurrencies: string[];
  receiveCurrencies: string[];
  payoutMethods: PayoutMethod[];
}

export interface SenderTransferOptions {
  configurationVersion: number | null;
  quoteSlaMinutes: number;
  corridors: TransferCorridorOption[];
}

export interface RecipientDestinationOption {
  country: string;
  receiveCurrencies: string[];
  payoutMethods: PayoutMethod[];
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export function countryLabel(country: string) {
  return regionNames.of(country) || country;
}

export function recipientDestinationOptions(
  options: SenderTransferOptions
): RecipientDestinationOption[] {
  const destinations = new Map<string, { receiveCurrencies: Set<string>; payoutMethods: Set<PayoutMethod> }>();
  for (const corridor of options.corridors) {
    const destination = destinations.get(corridor.destinationCountry) ?? {
      receiveCurrencies: new Set<string>(),
      payoutMethods: new Set<PayoutMethod>()
    };
    for (const currency of corridor.receiveCurrencies) destination.receiveCurrencies.add(currency);
    for (const method of corridor.payoutMethods) destination.payoutMethods.add(method);
    destinations.set(corridor.destinationCountry, destination);
  }
  return [...destinations].map(([country, policy]) => ({
    country,
    receiveCurrencies: [...policy.receiveCurrencies],
    payoutMethods: [...policy.payoutMethods]
  }));
}

export function reconcileRecipientDestination(
  destinations: RecipientDestinationOption[],
  country: string,
  payoutMethod: PayoutMethod | null
) {
  const destination = destinations.find((item) => item.country === country);
  if (!destination) return { country: "", payoutMethod: null };
  return {
    country: destination.country,
    payoutMethod: payoutMethod && destination.payoutMethods.includes(payoutMethod)
      ? payoutMethod
      : destination.payoutMethods[0] || null
  };
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

export interface AssociateRecord {
  id: string;
  businessName: string;
  countries: string[];
  cities: string[];
  payoutMethods: PayoutMethod[];
  currencies: string[];
  contactChannels: Record<string, string>;
  trustNotes: string | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  createdAt: string;
  updatedAt: string;
}

export interface PayoutEvidenceRecord {
  id: string;
  payoutCaseId: string;
  externalReference: string | null;
  hasAttachment: boolean;
  originalFilename: string | null;
  contentType: string | null;
  sizeBytes: string | null;
  uploadExpiresAt: string | null;
  uploadedAt: string | null;
  createdAt: string;
}

export interface PayoutCaseRecord {
  id: string;
  transferRequestId: string;
  staffOwnerId: string;
  staffOwner: { id: string; fullName: string } | null;
  associateContactId: string | null;
  amountMinor: string;
  currency: string;
  payoutMethod: PayoutMethod;
  expectedBy: string;
  status: "PENDING" | "IN_PROGRESS" | "REPORTED" | "COMPLETED" | "ON_HOLD" | "FAILED";
  externalReference: string | null;
  internalNote: string | null;
  senderFacingNote: string | null;
  completedAmountMinor: string | null;
  completedCurrency: string | null;
  completedAt: string | null;
  associate: AssociateRecord | null;
  evidence: PayoutEvidenceRecord[];
}

export interface OperationsPayoutState {
  transferStatus: string;
  payoutCase: PayoutCaseRecord | null;
}

export interface SenderPayoutState {
  transferStatus: string;
  payout: null | {
    status: PayoutCaseRecord["status"];
    amountMinor: string;
    currency: string;
    payoutMethod: PayoutMethod;
    expectedBy: string;
    senderFacingNote: string | null;
    completedAt: string | null;
  };
}

export interface ConfirmationRecord {
  id: string;
  source: "STAFF" | "SENDER" | "RECIPIENT";
  note: string | null;
  confirmedAt: string;
}

export interface DisputeRecord {
  id: string;
  category: string;
  reason?: string;
  previousTransferStatus: string;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED";
  resolutionAction: "RESUME" | "REFUND" | "COMPLETE" | "FAIL" | "REJECT" | null;
  resolution?: string | null;
  openedAt: string;
  resolvedAt: string | null;
}

export interface RefundRecord {
  id: string;
  amountMinor: string;
  currency: string;
  status: "PENDING" | "REFUNDED" | "FAILED";
  senderFacingReason: string;
  reason?: string;
  externalReference?: string | null;
  initiatedAt: string;
  refundedAt: string | null;
}

export interface ResolutionState {
  transferStatus: string;
  confirmations: ConfirmationRecord[];
  disputes: DisputeRecord[];
  refund: RefundRecord | null;
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
    PAYOUT_IN_PROGRESS: "Payout in progress",
    PAYOUT_REPORTED: "Payout sent",
    CONFIRMATION_PENDING: "Confirmation needed",
    COMPLETED: "Completed",
    ON_HOLD: "On hold",
    DISPUTED: "Disputed",
    REFUND_PENDING: "Refund in progress",
    REFUNDED: "Refunded",
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
      : status === "NEEDS_INFO" || status === "ON_HOLD"
        ? "warning"
        : status === "PAYOUT_REPORTED" || status === "COMPLETED"
          ? "success"
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
