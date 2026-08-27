import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasSameOriginHost, resolveApiBaseUrl } from "./backend-policy";

export const ACCESS_COOKIE = "hawelly_access";
export const REFRESH_COOKIE = "hawelly_refresh";
export const UPSTREAM_TIMEOUT_MS = 10_000;

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

export async function readJsonResponse(response: Response) {
  const payload = await response.json().catch(() => null);
  return payload && typeof payload === "object" ? payload : null;
}

export function requestIdHeaders(request: NextRequest) {
  const requestId = request.headers.get("x-request-id");
  return requestId ? { "X-Request-Id": requestId } : {};
}

export function sameOriginMutation(request: NextRequest) {
  return hasSameOriginHost(
    request.headers.get("origin"),
    request.headers.get("host")
  );
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
