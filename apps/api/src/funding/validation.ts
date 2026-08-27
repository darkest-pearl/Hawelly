import { z } from "zod";

const minorAmount = z.string().regex(/^[1-9]\d{0,18}$/);
const currency = z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase());

export const publishFundingInstructionSchema = z.object({
  templateId: z.uuid(),
  senderReference: z.string().trim().min(1).max(100),
  validUntil: z.iso.datetime().optional()
}).strict();

export const submitFundingProofSchema = z.object({
  reference: z.string().trim().min(1).max(200).optional(),
  amountMinor: minorAmount.optional(),
  currency: currency.optional(),
  transferredAt: z.iso.datetime().optional(),
  senderNote: z.string().trim().min(1).max(1_000).optional(),
  attachment: z.object({
    filename: z.string().trim().min(1).max(255),
    contentType: z.string().trim().min(1).max(160),
    sizeBytes: z.number().int().positive()
  }).strict().optional()
}).strict().superRefine((value, context) => {
  if (!value.reference && !value.attachment) {
    context.addIssue({ code: "custom", message: "A funding reference or attachment is required" });
  }
  if (Boolean(value.amountMinor) !== Boolean(value.currency)) {
    context.addIssue({ code: "custom", path: ["currency"], message: "Amount and currency must be supplied together" });
  }
});

export const reviewFundingProofSchema = z.object({
  decision: z.enum(["VERIFY", "REQUEST_RESUBMISSION", "REJECT"]),
  reason: z.string().trim().min(1).max(1_000)
}).strict();

export const confirmFundsSchema = z.object({
  proofId: z.uuid(),
  reason: z.string().trim().min(1).max(1_000)
}).strict();

export const signedEvidenceQuerySchema = z.object({
  expires: z.coerce.number().int().positive(),
  signature: z.string().regex(/^[A-Za-z0-9_-]{43}$/)
}).strict();
