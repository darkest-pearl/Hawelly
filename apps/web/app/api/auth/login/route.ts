import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  apiUrl,
  loginRateLimitIdentity,
  parseSessionPayload,
  readBoundedRequestBody,
  readJsonResponse,
  RequestBodyTooLargeError,
  requestIdHeaders,
  safeError,
  sameOriginMutation,
  setLoginClientCookie,
  setSessionCookies,
  UPSTREAM_TIMEOUT_MS
} from "../../../../lib/server-api";

export async function POST(request: NextRequest) {
  if (!sameOriginMutation(request)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Forbidden" } },
      { status: 403 }
    );
  }
  const rateLimitIdentity = loginRateLimitIdentity(request);
  let body: string;
  try {
    body = await readBoundedRequestBody(request);
  } catch (error) {
    if (!(error instanceof RequestBodyTooLargeError)) throw error;
    const response = NextResponse.json(
      { error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } },
      { status: 413 }
    );
    if (rateLimitIdentity.clientId) {
      setLoginClientCookie(response, rateLimitIdentity.clientId);
    }
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const upstream = await fetch(apiUrl("/auth/login"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Source": "WEB",
      "X-Hawelly-BFF-Rate-Limit-Id": rateLimitIdentity.value,
      ...requestIdHeaders(request)
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  });
  const payload = await readJsonResponse(upstream);
  if (!upstream.ok || !payload) {
    const response = safeError(upstream.status, payload);
    if (rateLimitIdentity.clientId) {
      setLoginClientCookie(response, rateLimitIdentity.clientId);
    }
    return response;
  }
  const session = parseSessionPayload(payload);
  if (!session) {
    const response = safeError(502, null);
    if (rateLimitIdentity.clientId) {
      setLoginClientCookie(response, rateLimitIdentity.clientId);
    }
    return response;
  }
  const response = NextResponse.json({ user: session.user }, { status: 200 });
  if (rateLimitIdentity.clientId) {
    setLoginClientCookie(response, rateLimitIdentity.clientId);
  }
  setSessionCookies(response, session);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
