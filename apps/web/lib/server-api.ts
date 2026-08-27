import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasSameOrigin, resolveApiBaseUrl } from "./backend-policy";

export const ACCESS_COOKIE = "hawelly_access";
export const REFRESH_COOKIE = "hawelly_refresh";
export const LOGIN_CLIENT_COOKIE = "hawelly_login_client";
export const UPSTREAM_TIMEOUT_MS = 10_000;
export const MAX_REQUEST_BODY_BYTES = 1_048_576;

export class RequestBodyTooLargeError extends Error {}

interface SessionPayload {
  accessToken: string;
  refreshToken: string;
  accessExpiresInSeconds: number;
  refreshExpiresAt: string;
  user: Record<string, unknown>;
}

export function parseSessionPayload(payload: unknown): SessionPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Record<string, unknown>;
  if (
    typeof candidate.accessToken !== "string" ||
    typeof candidate.refreshToken !== "string" ||
    typeof candidate.accessExpiresInSeconds !== "number" ||
    !Number.isSafeInteger(candidate.accessExpiresInSeconds) ||
    candidate.accessExpiresInSeconds < 1 ||
    typeof candidate.refreshExpiresAt !== "string" ||
    !Number.isFinite(new Date(candidate.refreshExpiresAt).getTime()) ||
    !candidate.user ||
    typeof candidate.user !== "object"
  ) {
    return null;
  }
  return candidate as unknown as SessionPayload;
}

export function apiUrl(path: string) {
  return new URL(path, resolveApiBaseUrl(process.env.HAWELLY_API_URL));
}

export function setSessionCookies(response: NextResponse, session: SessionPayload) {
  const secure = process.env.NODE_ENV === "production";
  const base = {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/"
  };
  response.cookies.set(ACCESS_COOKIE, session.accessToken, {
    ...base,
    path: "/api/backend",
    maxAge: session.accessExpiresInSeconds
  });
  const refreshMaxAge = Math.max(
    1,
    Math.floor((new Date(session.refreshExpiresAt).getTime() - Date.now()) / 1_000)
  );
  response.cookies.set(REFRESH_COOKIE, session.refreshToken, {
    ...base,
    path: "/api/auth",
    maxAge: refreshMaxAge
  });
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/api/backend"
  });
  response.cookies.set(REFRESH_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/api/auth"
  });
}

export function loginRateLimitIdentity(
  request: NextRequest,
  environment: NodeJS.ProcessEnv = process.env
) {
  if (environment.NODE_ENV === "production") {
    const headerName = environment.HAWELLY_CLIENT_IP_HEADER?.trim().toLowerCase();
    if (!headerName || !/^[a-z0-9-]+$/.test(headerName)) {
      throw new Error("HAWELLY_CLIENT_IP_HEADER must name a trusted ingress header");
    }
    const clientIp = request.headers.get(headerName)?.trim() || "";
    if (!isIP(clientIp)) {
      throw new Error("Trusted ingress did not supply an exact client IP address");
    }
    return { value: `ip:${clientIp}` };
  }
  const existing = request.cookies.get(LOGIN_CLIENT_COOKIE)?.value || "";
  const clientId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    existing
  )
    ? existing.toLowerCase()
    : randomUUID();
  return { value: `client:${clientId}`, clientId };
}

export function setLoginClientCookie(response: NextResponse, clientId: string) {
  response.cookies.set(LOGIN_CLIENT_COOKIE, clientId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth/login",
    maxAge: 2_592_000
  });
}

export async function readBoundedRequestBody(
  request: Request,
  maximumBytes = MAX_REQUEST_BODY_BYTES
) {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > maximumBytes
  ) {
    throw new RequestBodyTooLargeError("Request body is too large");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new RequestBodyTooLargeError("Request body is too large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function readJsonResponse(response: Response) {
  const payload = await response.json().catch(() => null);
  return payload && typeof payload === "object" ? payload : null;
}

export function requestIdHeaders(request: NextRequest) {
  const requestId = request.headers.get("x-request-id");
  return requestId ? { "X-Request-Id": requestId } : {};
}

export function expectedWebOrigin(
  request: NextRequest,
  environment: NodeJS.ProcessEnv = process.env
) {
  if (environment.NODE_ENV === "production") {
    const value = environment.HAWELLY_WEB_ORIGIN?.trim() || "";
    if (!value) {
      throw new Error("HAWELLY_WEB_ORIGIN must be an exact HTTP(S) origin");
    }
    const origin = new URL(value);
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.origin !== value
    ) {
      throw new Error("HAWELLY_WEB_ORIGIN must be an exact HTTP(S) origin");
    }
    return origin.origin;
  }
  const host = request.headers.get("host") || request.nextUrl.host;
  if (!host) throw new Error("Request Host is unavailable");
  return new URL(`${request.nextUrl.protocol}//${host}`).origin;
}

export function sameOriginMutation(request: NextRequest) {
  try {
    return hasSameOrigin(
      request.headers.get("origin"),
      expectedWebOrigin(request)
    );
  } catch {
    return false;
  }
}

export function safeError(status: number, payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object"
  ) {
    const response = NextResponse.json(payload, { status });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const response = NextResponse.json(
    { error: { code: "UPSTREAM_ERROR", message: "Request could not be completed" } },
    { status: status >= 400 && status <= 599 ? status : 502 }
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
