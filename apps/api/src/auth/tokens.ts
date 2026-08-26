import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { AuthConfig } from "./config.js";

const REFRESH_PREFIX = "hwr1";

export interface AccessClaims {
  userId: string;
  sessionId: string;
  sessionVersion: number;
}

export interface PreparedRefreshToken {
  sessionId: string;
  token: string;
  tokenHash: string;
}

export function hashRefreshToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function prepareRefreshToken(
  sessionId: string = randomUUID()
): PreparedRefreshToken {
  const secret = randomBytes(32).toString("base64url");
  const token = `${REFRESH_PREFIX}.${sessionId}.${secret}`;
  return { sessionId, token, tokenHash: hashRefreshToken(token) };
}

export function parseRefreshToken(token: string) {
  const parts = token.split(".");
  if (
    parts.length !== 3 ||
    parts[0] !== REFRESH_PREFIX ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      parts[1] || ""
    ) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[2] || "")
  ) {
    return null;
  }
  return { sessionId: parts[1] as string, tokenHash: hashRefreshToken(token) };
}

export function tokenHashesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function signAccessToken(
  claims: AccessClaims,
  config: AuthConfig,
  now: Date
) {
  const issuedAt = Math.floor(now.getTime() / 1_000);
  return new SignJWT({
    sid: claims.sessionId,
    sv: claims.sessionVersion
  })
    .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setSubject(claims.userId)
    .setJti(randomUUID())
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + config.accessTtlSeconds)
    .sign(config.accessSecret);
}

export async function verifyAccessToken(
  token: string,
  config: AuthConfig
): Promise<AccessClaims> {
  const result = await jwtVerify(token, config.accessSecret, {
    algorithms: ["HS256"],
    issuer: config.issuer,
    audience: config.audience,
    typ: "at+jwt"
  });
  const sessionId = result.payload.sid;
  const sessionVersion = result.payload.sv;
  if (
    typeof result.payload.sub !== "string" ||
    typeof sessionId !== "string" ||
    typeof sessionVersion !== "number" ||
    !Number.isSafeInteger(sessionVersion)
  ) {
    throw new Error("Invalid access token claims");
  }
  return {
    userId: result.payload.sub,
    sessionId,
    sessionVersion
  };
}
