import { describe, expect, it } from "vitest";
import { resolveAuthConfig } from "./config.js";

const validEnvironment = {
  AUTH_ACCESS_SECRET: "access-secret-with-at-least-thirty-two-bytes",
  AUTH_RATE_LIMIT_PEPPER: "rate-limit-pepper-with-at-least-thirty-two-bytes"
};

describe("auth configuration", () => {
  it("uses bounded security defaults", () => {
    const config = resolveAuthConfig(validEnvironment);
    expect(config.accessTtlSeconds).toBe(900);
    expect(config.refreshTtlSeconds).toBe(604_800);
    expect(config.sessionAbsoluteTtlSeconds).toBe(2_592_000);
    expect(config.registrationIpMaxAttempts).toBe(5);
    expect(config.loginIdentifierMaxFailures).toBe(5);
    expect(config.loginAccountMaxFailures).toBe(20);
  });

  it.each([
    [{ ...validEnvironment, AUTH_ACCESS_SECRET: "short" }, "AUTH_ACCESS_SECRET"],
    [
      {
        ...validEnvironment,
        AUTH_RATE_LIMIT_PEPPER: validEnvironment.AUTH_ACCESS_SECRET
      },
      "must be distinct"
    ],
    [
      { ...validEnvironment, AUTH_ACCESS_TTL_SECONDS: "59" },
      "AUTH_ACCESS_TTL_SECONDS"
    ],
    [
      { ...validEnvironment, AUTH_LOGIN_IDENTIFIER_MAX_FAILURES: "NaN" },
      "AUTH_LOGIN_IDENTIFIER_MAX_FAILURES"
    ]
  ])("rejects unsafe configuration %#", (environment, expectedMessage) => {
    expect(() => resolveAuthConfig(environment)).toThrow(expectedMessage);
  });
});
