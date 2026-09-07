import type { PayoutMethod } from "./workflow";

const CONTROL_CHARACTER = /\p{Cc}/u;
const REPEATED_WHITESPACE = /\s+/gu;
const INTERNATIONAL_PHONE = /^\+[1-9]\d{7,14}$/;

export interface RecipientDraft {
  fullName: string;
  phone: string;
  address: string;
  payoutMethod: PayoutMethod;
  accountName: string;
  bankName: string;
  accountNumber: string;
  city: string;
  provider: string;
  instructions: string;
}

export interface ValidRecipientDraft {
  fullName: string;
  phone: string | null;
  address: string | null;
  payoutDetails: Record<string, string>;
}

function codePointLength(value: string) {
  return [...value].length;
}

function required(
  errors: Record<string, string>,
  key: string,
  rawValue: string,
  label: string,
  maximum: number
) {
  const value = rawValue.trim();
  if (!value) errors[key] = `Enter ${label}.`;
  else if (codePointLength(value) > maximum) {
    errors[key] = `${label[0]?.toUpperCase()}${label.slice(1)} must be ${maximum} characters or fewer.`;
  }
  return value;
}

export function validateRecipientDraft(draft: RecipientDraft): {
  value: ValidRecipientDraft | null;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const normalizedName = draft.fullName.trim().replace(REPEATED_WHITESPACE, " ");
  if (CONTROL_CHARACTER.test(draft.fullName)) {
    errors.fullName = "Name cannot contain control characters.";
  } else if (!normalizedName) {
    errors.fullName = "Enter a name.";
  } else if (codePointLength(normalizedName) > 160) {
    errors.fullName = "Name must be 160 characters or fewer.";
  }

  const phone = draft.phone.trim() || null;
  if (phone && !INTERNATIONAL_PHONE.test(phone)) {
    errors.phone = "Use international format, for example +971501234567.";
  }
  const address = draft.address.trim() || null;
  if (address && codePointLength(address) > 500) {
    errors.address = "Address must be 500 characters or fewer.";
  }

  let payoutDetails: Record<string, string>;
  if (draft.payoutMethod === "BANK_TRANSFER") {
    payoutDetails = {
      accountName: required(errors, "accountName", draft.accountName, "the account holder name", 160),
      bankName: required(errors, "bankName", draft.bankName, "the bank name", 160),
      accountNumber: required(errors, "accountNumber", draft.accountNumber, "the account number", 100)
    };
  } else if (draft.payoutMethod === "MOBILE_MONEY") {
    payoutDetails = {
      provider: required(errors, "provider", draft.provider, "the mobile-money provider", 160),
      accountNumber: required(errors, "accountNumber", draft.accountNumber, "the account number", 100)
    };
  } else if (draft.payoutMethod === "CASH_PICKUP") {
    payoutDetails = {
      city: required(errors, "city", draft.city, "the pickup city", 160)
    };
  } else {
    payoutDetails = {
      instructions: required(errors, "instructions", draft.instructions, "the payout instructions", 500)
    };
  }

  return {
    value: Object.keys(errors).length
      ? null
      : { fullName: normalizedName, phone, address, payoutDetails },
    errors
  };
}
