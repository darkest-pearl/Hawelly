import { readStrongSecret } from "../security/secrets.js";

export interface AuthConfig {
  accessSecret: Uint8Array;
  rateLimitPepper: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  sessionAbsoluteTtlSeconds: number;
  registrationWindowSeconds: number;
  registrationIpMaxAttempts: number;
  loginWindowSeconds: number;
  loginIpMaxFailures: number;
  loginIdentifierMaxFailures: number;
  loginAccountMaxFailures: number;
  issuer: string;
  audience: string;
}

function readBoundedInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export function resolveAuthConfig(
  environment: NodeJS.ProcessEnv = process.env
): AuthConfig {
  const accessSecret = readStrongSecret(environment, "AUTH_ACCESS_SECRET");
  const rateLimitPepper = readStrongSecret(environment, "AUTH_RATE_LIMIT_PEPPER");

  if (accessSecret === rateLimitPepper) {
    throw new Error("AUTH_ACCESS_SECRET and AUTH_RATE_LIMIT_PEPPER must be distinct");
  }

  return {
    accessSecret: new TextEncoder().encode(accessSecret),
    rateLimitPepper,
    accessTtlSeconds: readBoundedInteger(
      environment,
      "AUTH_ACCESS_TTL_SECONDS",
      900,
      60,
      3_600
    ),
    refreshTtlSeconds: readBoundedInteger(
      environment,
      "AUTH_REFRESH_TTL_SECONDS",
      604_800,
      3_600,
      2_592_000
    ),
    sessionAbsoluteTtlSeconds: readBoundedInteger(
      environment,
      "AUTH_SESSION_ABSOLUTE_TTL_SECONDS",
      2_592_000,
      86_400,
      7_776_000
    ),
    registrationWindowSeconds: readBoundedInteger(
      environment,
      "AUTH_REGISTRATION_WINDOW_SECONDS",
      3_600,
      60,
      86_400
    ),
    registrationIpMaxAttempts: readBoundedInteger(
      environment,
      "AUTH_REGISTRATION_IP_MAX_ATTEMPTS",
      5,
      2,
      1_000
    ),
    loginWindowSeconds: readBoundedInteger(
      environment,
      "AUTH_LOGIN_WINDOW_SECONDS",
      900,
      60,
      86_400
    ),
    loginIpMaxFailures: readBoundedInteger(
      environment,
      "AUTH_LOGIN_IP_MAX_FAILURES",
      10,
      2,
      1_000
    ),
    loginIdentifierMaxFailures: readBoundedInteger(
      environment,
      "AUTH_LOGIN_IDENTIFIER_MAX_FAILURES",
      5,
      2,
      1_000
    ),
    loginAccountMaxFailures: readBoundedInteger(
      environment,
      "AUTH_LOGIN_ACCOUNT_MAX_FAILURES",
      20,
      5,
      10_000
    ),
    issuer: "hawelly-api",
    audience: "hawelly-clients"
  };
}
