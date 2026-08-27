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
    ["operations/transfers", "GET"],
    [`operations/transfers/${id}/review`, "POST"],
    [`operations/transfers/${id}/quotes`, "POST"],
    [`operations/transfers/${id}/quotes/${id}/send`, "POST"]
  ])("allows %s %s", (path, method) => {
    expect(isAllowedBackendRequest(path, method)).toBe(true);
  });

  it.each([
    ["auth/login", "POST"],
    ["admin/configuration", "GET"],
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
