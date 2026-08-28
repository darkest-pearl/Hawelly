import { z } from "zod";

const reason = z.string().trim().min(1).max(1_000);

export const confirmationNoteSchema = z.object({ note: z.string().trim().min(1).max(1_000).optional() }).strict();
export const dangerousCompletionSchema = z.object({ reason }).strict();
export const openDisputeSchema = z.object({
  category: z.enum(["RECIPIENT_NOT_PAID", "WRONG_AMOUNT", "PAYOUT_DELAYED", "OTHER"]),
  reason: z.string().trim().min(1).max(2_000)
}).strict();
export const resolveDisputeSchema = z.object({
  action: z.enum(["RESUME", "REFUND", "COMPLETE", "FAIL", "REJECT"]),
  resolution: z.string().trim().min(1).max(4_000),
  senderFacingReason: z.string().trim().min(1).max(1_000).optional()
}).strict();
export const startRefundSchema = z.object({
  reason: z.string().trim().min(1).max(2_000),
  senderFacingReason: reason
}).strict();
export const confirmRefundSchema = z.object({
  externalReference: z.string().trim().min(1).max(300),
  refundedAt: z.iso.datetime(),
  reason
}).strict();
