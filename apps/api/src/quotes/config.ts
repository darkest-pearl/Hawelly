export interface QuoteWorkflowConfig {
  defaultExpiryMinutes: number;
}

export function resolveQuoteWorkflowConfig(
  environment: NodeJS.ProcessEnv = process.env
): QuoteWorkflowConfig {
  const raw = environment.QUOTE_DEFAULT_EXPIRY_MINUTES?.trim();
  if (!raw) return { defaultExpiryMinutes: 30 };
  if (!/^\d+$/.test(raw)) {
    throw new Error("QUOTE_DEFAULT_EXPIRY_MINUTES must be an integer between 5 and 1440");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 5 || value > 1_440) {
    throw new Error("QUOTE_DEFAULT_EXPIRY_MINUTES must be an integer between 5 and 1440");
  }
  return { defaultExpiryMinutes: value };
}
