import { PayoutMethod } from "../generated/prisma/enums.js";
import { z } from "zod";

export const uuidSchema = z.uuid();
export const countryCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/)
  .transform((value) => value.toUpperCase());
export const currencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/)
  .transform((value) => value.toUpperCase());

const nullableTrimmed = (maximum: number) =>
  z.union([z.string().trim().min(1).max(maximum), z.null()]).optional();

export const recipientCreateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(160),
    country: countryCodeSchema,
    phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/).optional(),
    payoutMethod: z.enum(PayoutMethod),
    payoutDetails: z.record(z.string(), z.unknown()),
    address: z.string().trim().min(1).max(500).optional()
  })
  .strict();

export const recipientPatchSchema = z
  .object({
    fullName: z.string().trim().min(1).max(160).optional(),
    country: countryCodeSchema.optional(),
    phone: nullableTrimmed(32),
    payoutMethod: z.enum(PayoutMethod).optional(),
    payoutDetails: z.record(z.string(), z.unknown()).optional(),
    address: nullableTrimmed(500)
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

const bankTransferDetails = z
  .object({
    accountName: z.string().trim().min(1).max(160),
    bankName: z.string().trim().min(1).max(160),
    accountNumber: z.string().trim().min(1).max(100),
    bankCode: z.string().trim().min(1).max(100).optional()
  })
  .strict();
const cashPickupDetails = z.object({ city: z.string().trim().min(1).max(160) }).strict();
const mobileMoneyDetails = z
  .object({
    provider: z.string().trim().min(1).max(160),
    accountNumber: z.string().trim().min(1).max(100)
  })
  .strict();
const otherDetails = z
  .object({ instructions: z.string().trim().min(1).max(500) })
  .strict();

export function parsePayoutDetails(method: PayoutMethod, value: unknown) {
  if (method === PayoutMethod.BANK_TRANSFER) return bankTransferDetails.parse(value);
  if (method === PayoutMethod.CASH_PICKUP) return cashPickupDetails.parse(value);
  if (method === PayoutMethod.MOBILE_MONEY) return mobileMoneyDetails.parse(value);
  return otherDetails.parse(value);
}

export const createTransferSchema = z
  .object({
    recipientId: uuidSchema,
    originCountry: countryCodeSchema,
    destinationCountry: countryCodeSchema,
    sendAmountMinor: z.string().regex(/^[1-9]\d{0,18}$/),
    sendCurrency: currencyCodeSchema,
    requestedPayoutMethod: z.enum(PayoutMethod),
    senderNote: z.string().trim().min(1).max(1_000).optional()
  })
  .strict();

export const cancelTransferSchema = z
  .object({ reason: z.string().trim().min(1).max(500).optional() })
  .strict();

export const reviewTransferSchema = z
  .object({
    action: z.enum(["REQUEST_INFO", "START_QUOTING", "DECLINE"]),
    reason: z.string().trim().min(1).max(1_000).optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action !== "START_QUOTING" && !value.reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A reason is required"
      });
    }
  });

export const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
  .strict();

