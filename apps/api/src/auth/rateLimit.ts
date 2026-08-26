import { RateLimitScope, type Prisma } from "../generated/prisma/client.js";
import type { HawellyPrismaClient } from "../db/prisma.js";
import { hashAuditIdentifier } from "./audit.js";
import type { AuthConfig } from "./config.js";

type RateLimitDatabase = HawellyPrismaClient | Prisma.TransactionClient;

export interface LoginRateLimitKeys {
  ipKey: string;
  ipIdentifierKey: string;
  identifierKey: string;
}

export interface RateLimitDecision {
  blocked: boolean;
  retryAfterSeconds: number;
}

export function buildLoginRateLimitKeys(
  ipAddress: string,
  normalizedIdentifier: string,
  config: AuthConfig
): LoginRateLimitKeys {
  return {
    ipKey: hashAuditIdentifier(`ip:${ipAddress}`, config.rateLimitPepper),
    ipIdentifierKey: hashAuditIdentifier(
      `ip-identifier:${ipAddress}:${normalizedIdentifier}`,
      config.rateLimitPepper
    ),
    identifierKey: hashAuditIdentifier(
      `identifier:${normalizedIdentifier}`,
      config.rateLimitPepper
    )
  };
}

export function buildRegistrationRateLimitKey(
  ipAddress: string,
  config: AuthConfig
) {
  return hashAuditIdentifier(`registration-ip:${ipAddress}`, config.rateLimitPepper);
}

export async function lockRateLimitKeys(
  database: RateLimitDatabase,
  keys: readonly string[]
) {
  const uniqueKeys = [...new Set(keys)].sort();
  for (const key of uniqueKeys) {
    await database.$queryRaw`
      WITH acquired AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
      )
      SELECT 1 AS "acquired" FROM acquired
    `;
  }
}

export async function readRateLimit(
  database: RateLimitDatabase,
  keys: readonly string[],
  now: Date
): Promise<RateLimitDecision> {
  const buckets = await database.authRateLimit.findMany({
    where: { keyHash: { in: [...new Set(keys)] } }
  });
  const blockedUntil = buckets.reduce<Date | null>((latest, bucket) => {
    if (!bucket.blockedUntil || bucket.blockedUntil <= now) return latest;
    if (!latest || bucket.blockedUntil > latest) return bucket.blockedUntil;
    return latest;
  }, null);
  if (!blockedUntil) return { blocked: false, retryAfterSeconds: 0 };
  return {
    blocked: true,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((blockedUntil.getTime() - now.getTime()) / 1_000)
    )
  };
}

async function recordBucketAttempt(
  database: RateLimitDatabase,
  keyHash: string,
  scope: RateLimitScope,
  maximumAttempts: number,
  windowSeconds: number,
  now: Date
) {
  const expiredBefore = new Date(now.getTime() - windowSeconds * 1_000);
  await database.$executeRaw`
    INSERT INTO "AuthRateLimit" (
      "keyHash", "scope", "failureCount", "windowStartedAt", "blockedUntil", "updatedAt"
    ) VALUES (
      ${keyHash}, CAST(${scope} AS "RateLimitScope"), 1, ${now}, NULL, ${now}
    )
    ON CONFLICT ("keyHash") DO UPDATE SET
      "scope" = EXCLUDED."scope",
      "failureCount" = CASE
        WHEN "AuthRateLimit"."windowStartedAt" <= ${expiredBefore} THEN 1
        ELSE "AuthRateLimit"."failureCount" + 1
      END,
      "windowStartedAt" = CASE
        WHEN "AuthRateLimit"."windowStartedAt" <= ${expiredBefore} THEN ${now}
        ELSE "AuthRateLimit"."windowStartedAt"
      END,
      "blockedUntil" = CASE
        WHEN "AuthRateLimit"."windowStartedAt" <= ${expiredBefore} THEN NULL
        WHEN "AuthRateLimit"."failureCount" + 1 >= ${maximumAttempts}
          THEN "AuthRateLimit"."windowStartedAt" + make_interval(secs => ${windowSeconds})
        ELSE NULL
      END,
      "updatedAt" = ${now}
  `;
}

export function recordRegistrationAttempt(
  database: RateLimitDatabase,
  keyHash: string,
  config: AuthConfig,
  now: Date
) {
  return recordBucketAttempt(
    database,
    keyHash,
    RateLimitScope.REGISTRATION_IP,
    config.registrationIpMaxAttempts,
    config.registrationWindowSeconds,
    now
  );
}

export async function recordLoginFailure(
  database: RateLimitDatabase,
  keys: LoginRateLimitKeys,
  config: AuthConfig,
  now: Date
) {
  await recordBucketAttempt(
    database,
    keys.ipKey,
    RateLimitScope.IP,
    config.loginIpMaxFailures,
    config.loginWindowSeconds,
    now
  );
  await recordBucketAttempt(
    database,
    keys.ipIdentifierKey,
    RateLimitScope.IP_IDENTIFIER,
    config.loginIdentifierMaxFailures,
    config.loginWindowSeconds,
    now
  );
  await recordBucketAttempt(
    database,
    keys.identifierKey,
    RateLimitScope.IDENTIFIER,
    config.loginAccountMaxFailures,
    config.loginWindowSeconds,
    now
  );
}

export function clearLoginIdentifierRateLimits(
  database: RateLimitDatabase,
  keys: LoginRateLimitKeys
) {
  return database.authRateLimit.deleteMany({
    where: { keyHash: { in: [keys.ipIdentifierKey, keys.identifierKey] } }
  });
}
