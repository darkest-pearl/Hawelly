import { describe, expect, it } from "vitest";
import {
  hasSameOrigin,
  isAllowedBackendRequest,
  resolveApiBaseUrl
} from "./backend-policy";

const id = "00000000-0000-4000-8000-000000000001";

describe("web backend boundary policy", () => {
  it.each([
    ["me", "GET"],
    ["recipients", "POST"],
    [`recipients/${id}`, "PATCH"],
    ["transfers", "POST"],
    [`transfers/${id}/cancel`, "POST"],
    [`transfers/${id}/quotes`, "GET"],
    [`transfers/${id}/quotes/${id}/decision`, "POST"],
    [`transfers/${id}/funding`, "GET"],
    [`transfers/${id}/funding-proofs`, "POST"],
    [`transfers/${id}/funding-proofs/${id}/read-url`, "POST"],
    [`transfers/${id}/payout`, "GET"],
    [`transfers/${id}/resolution`, "GET"],
    [`transfers/${id}/recipient-confirmation`, "POST"],
    [`transfers/${id}/disputes`, "POST"],
    ["operations/transfers", "GET"],
    ["operations/funding-templates", "GET"],
    ["operations/associates", "GET"],
    ["operations/associates", "POST"],
    [`operations/associates/${id}`, "PATCH"],
    [`operations/transfers/${id}/review`, "POST"],
    [`operations/transfers/${id}/quotes`, "POST"],
    [`operations/transfers/${id}/quotes/${id}/send`, "POST"],
    [`operations/transfers/${id}/funding`, "GET"],
    [`operations/transfers/${id}/funding-instruction`, "POST"],
    [`operations/transfers/${id}/funding-proofs/${id}/read-url`, "POST"],
    [`operations/transfers/${id}/funding-proofs/${id}/review`, "POST"],
    [`operations/transfers/${id}/funds-confirmation`, "POST"],
    [`operations/transfers/${id}/payout`, "GET"],
    [`operations/transfers/${id}/payout-case`, "POST"],
    [`operations/transfers/${id}/payout-case`, "PATCH"],
    [`operations/transfers/${id}/payout-evidence`, "POST"],
    [`operations/transfers/${id}/payout-evidence/${id}/read-url`, "POST"],
    [`operations/transfers/${id}/payout-report`, "POST"],
    [`operations/transfers/${id}/payout-hold`, "POST"],
    [`operations/transfers/${id}/payout-release`, "POST"],
    [`operations/transfers/${id}/resolution`, "GET"],
    [`operations/transfers/${id}/confirmation-request`, "POST"],
    [`operations/transfers/${id}/admin-completion`, "POST"],
    [`operations/transfers/${id}/disputes`, "POST"],
    [`operations/transfers/${id}/disputes/${id}/review`, "POST"],
    [`operations/transfers/${id}/disputes/${id}/resolve`, "POST"],
    [`operations/transfers/${id}/refund`, "POST"],
    [`operations/transfers/${id}/refund-confirmation`, "POST"]
  ])("allows %s %s", (path, method) => {
    expect(isAllowedBackendRequest(path, method)).toBe(true);
  });

  it.each([
    ["auth/login", "POST"],
    ["admin/configuration", "GET"],
    ["admin/configuration", "POST"],
    ["admin/staff", "GET"],
    ["admin/staff", "POST"],
    [`admin/staff/${id}`, "PATCH"],
    [`admin/staff/${id}/capabilities`, "POST"],
    [`admin/staff/${id}/capabilities/QUOTE_MANAGE`, "DELETE"],
    ["admin/funding-templates", "GET"],
    ["admin/funding-templates", "POST"],
    [`admin/funding-templates/${id}`, "PATCH"],
    ["admin/activity", "GET"],
    ["admin/dashboard", "GET"],
    ["recipients/not-a-uuid", "GET"],
    [`operations/transfers/${id}/review`, "DELETE"],
    ["transfers", "DELETE"]
  ])("rejects %s %s", (path, method) => {
    expect(isAllowedBackendRequest(path, method)).toBe(false);
  });

  it("validates the private API origin and mutation origin", () => {
    expect(resolveApiBaseUrl(undefined)).toBe("http://127.0.0.1:4000");
    expect(resolveApiBaseUrl("https://api.example.com")).toBe(
      "https://api.example.com"
    );
    expect(() => resolveApiBaseUrl("https://user:pass@example.com")).toThrow();
    expect(() => resolveApiBaseUrl("https://example.com/path")).toThrow();
    expect(hasSameOrigin("https://app.example.com", "https://app.example.com")).toBe(true);
    expect(hasSameOrigin("http://localhost:3000", "http://localhost:3000")).toBe(true);
    expect(hasSameOrigin("http://app.example.com", "https://app.example.com")).toBe(false);
    expect(hasSameOrigin("https://evil.example", "https://app.example.com")).toBe(false);
    expect(hasSameOrigin("javascript:alert(1)", "https://app.example.com")).toBe(false);
    expect(hasSameOrigin("not a URL", "https://app.example.com")).toBe(false);
    expect(hasSameOrigin(null, "https://app.example.com")).toBe(false);
  });
});
