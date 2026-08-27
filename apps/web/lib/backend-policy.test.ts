import { describe, expect, it } from "vitest";
import {
  hasSameOriginHost,
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
    ["operations/transfers", "GET"],
    [`operations/transfers/${id}/review`, "POST"]
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
    expect(hasSameOriginHost("https://app.example.com", "app.example.com")).toBe(true);
    expect(hasSameOriginHost("http://localhost:3000", "localhost:3000")).toBe(true);
    expect(hasSameOriginHost("https://evil.example", "app.example.com")).toBe(false);
    expect(hasSameOriginHost("javascript:alert(1)", "app.example.com")).toBe(false);
    expect(hasSameOriginHost("not a URL", "app.example.com")).toBe(false);
    expect(hasSameOriginHost(null, "app.example.com")).toBe(false);
    expect(hasSameOriginHost("https://app.example.com", null)).toBe(false);
  });
});
