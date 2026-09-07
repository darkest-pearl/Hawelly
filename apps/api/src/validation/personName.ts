import { z } from "zod";

const CONTROL_CHARACTER = /\p{Cc}/u;

export function normalizePersonName(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

export const personNameSchema = z
  .string()
  .refine((value) => !CONTROL_CHARACTER.test(value), {
    message: "Name must not contain control characters"
  })
  .transform(normalizePersonName)
  .pipe(z.string().min(1).max(160));
