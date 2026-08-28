import { z } from "zod";

const currency = z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase());
const country = z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase());
const minorAmount = z.string().regex(/^[1-9]\d{0,18}$/);
const optionalText = (maximum: number) => z.string().trim().min(1).max(maximum).optional();
const attachment = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(160),
  sizeBytes: z.number().int().positive()
}).strict();

export const associateCreateSchema = z.object({
  businessName: z.string().trim().min(1).max(200),
  countries: z.array(country).min(1).max(50),
  cities: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  payoutMethods: z.array(z.enum(["BANK_TRANSFER", "CASH_PICKUP", "MOBILE_MONEY", "OTHER"])).min(1).max(4),
  currencies: z.array(currency).min(1).max(50),
  contactChannels: z.record(z.string().trim().min(1).max(60), z.string().trim().min(1).max(500)),
  trustNotes: optionalText(2_000)
}).strict();

export const associatePatchSchema = associateCreateSchema.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const createPayoutCaseSchema = z.object({
  associateContactId: z.uuid().optional(),
  expectedBy: z.iso.datetime(),
  externalReference: optionalText(300),
  internalNote: optionalText(2_000),
  senderFacingNote: optionalText(500)
}).strict();

export const updatePayoutCaseSchema = z.object({
  staffOwnerId: z.uuid().optional(),
  associateContactId: z.uuid().optional(),
  expectedBy: z.iso.datetime().optional(),
  externalReference: optionalText(300),
  internalNote: optionalText(2_000),
  senderFacingNote: optionalText(500)
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const addPayoutEvidenceSchema = z.object({
  externalReference: optionalText(300),
  attachment: attachment.optional()
}).strict().superRefine((value, context) => {
  if (!value.externalReference && !value.attachment) {
    context.addIssue({ code: "custom", message: "An external reference or attachment is required" });
  }
});

export const reportPayoutSchema = z.object({
  completedAmountMinor: minorAmount,
  currency,
  completedAt: z.iso.datetime(),
  externalReference: optionalText(300),
  internalNote: optionalText(2_000),
  senderFacingNote: optionalText(500)
}).strict();

export const payoutHoldSchema = z.object({
  reason: z.string().trim().min(1).max(1_000),
  senderFacingNote: optionalText(500)
}).strict();

export const payoutReleaseSchema = z.object({
  reason: z.string().trim().min(1).max(1_000),
  senderFacingNote: optionalText(500)
}).strict();
