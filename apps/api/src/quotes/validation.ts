import { z } from "zod";

const positiveMinor = z.string().regex(/^[1-9]\d{0,18}$/);
const nonNegativeMinor = z.string().regex(/^\d{1,19}$/);
const currency = z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase());
const rate = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,12})?$/)
  .refine((value) => Number(value) > 0);

export const createQuoteSchema = z
  .object({
    sendAmountMinor: positiveMinor,
    sendCurrency: currency,
    feeAmountMinor: nonNegativeMinor,
    feeBreakdown: z.record(z.string().trim().min(1).max(80), nonNegativeMinor).optional(),
    effectiveRate: rate,
    receiveAmountMinor: positiveMinor,
    receiveCurrency: currency,
    expectedDeliveryAt: z.iso.datetime(),
    validForMinutes: z.number().int().min(5).max(1_440).optional(),
    senderFacingNote: z.string().trim().min(1).max(500).optional(),
    internalNote: z.string().trim().min(1).max(2_000).optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.feeBreakdown) {
      const components = Object.values(value.feeBreakdown);
      if (components.length > 20) {
        context.addIssue({ code: "custom", path: ["feeBreakdown"], message: "Fee breakdown has too many components" });
      } else if (components.reduce((sum, item) => sum + BigInt(item), 0n) !== BigInt(value.feeAmountMinor)) {
        context.addIssue({ code: "custom", path: ["feeBreakdown"], message: "Fee breakdown must equal the fee amount" });
      }
    }
  });

export const quoteDecisionSchema = z
  .object({
    decision: z.enum(["ACCEPT", "REJECT"]),
    reason: z.string().trim().min(1).max(500).optional()
  })
  .strict();
