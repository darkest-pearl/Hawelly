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
    DECLINED: "Declined",
    CANCELLED: "Cancelled"
  };
  const tone: TransferTone =
    status === "DECLINED" || status === "CANCELLED"
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

