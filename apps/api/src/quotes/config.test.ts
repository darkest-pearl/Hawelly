import { describe, expect, it } from "vitest";
import { resolveQuoteWorkflowConfig } from "./config.js";

describe("quote workflow configuration", () => {
  it("defaults to a 30-minute quote expiry", () => {
    expect(resolveQuoteWorkflowConfig({})).toEqual({ defaultExpiryMinutes: 30 });
  });

  it.each(["5", "30", "1440"])("accepts bounded expiry %s", (value) => {
    expect(resolveQuoteWorkflowConfig({ QUOTE_DEFAULT_EXPIRY_MINUTES: value }).defaultExpiryMinutes).toBe(Number(value));
  });

  it.each(["0", "4", "1441", "1.5", "invalid"])("rejects invalid expiry %s", (value) => {
    expect(() => resolveQuoteWorkflowConfig({ QUOTE_DEFAULT_EXPIRY_MINUTES: value })).toThrow("QUOTE_DEFAULT_EXPIRY_MINUTES");
  });
});
