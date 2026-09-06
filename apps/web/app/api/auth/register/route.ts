import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  apiUrl,
  loginRateLimitIdentity,
  MAX_AUTH_REQUEST_BODY_BYTES,
  parseSenderRegistration,
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

function invalidRequest() {
  return NextResponse.json(
    { error: { code: "INVALID_REQUEST", message: "Invalid request" } },
    { status: 400, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  if (!sameOriginMutation(request)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Forbidden" } },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const rateLimitIdentity = loginRateLimitIdentity(request);
  let body: string;
  try {
    body = await readBoundedRequestBody(request, MAX_AUTH_REQUEST_BODY_BYTES);
  } catch (error) {
    if (!(error instanceof RequestBodyTooLargeError)) throw error;
    const response = NextResponse.json(
      { error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } },
      { status: 413, headers: { "Cache-Control": "no-store" } }
    );
    if (rateLimitIdentity.clientId) {
      setLoginClientCookie(response, rateLimitIdentity.clientId);
    }
    return response;
  }

  const registration = parseSenderRegistration(body);
  if (!registration) {
    const response = invalidRequest();
    if (rateLimitIdentity.clientId) {
      setLoginClientCookie(response, rateLimitIdentity.clientId);
    }
    return response;
  }

  let upstream: Response;
  try {
    upstream = await fetch(apiUrl("/auth/register"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Source": "WEB",
        "X-Hawelly-BFF-Rate-Limit-Id": rateLimitIdentity.value,
        ...requestIdHeaders(request)
      },
      body: JSON.stringify(registration),
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });
  } catch {
    const response = NextResponse.json(
      {
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "Account creation is temporarily unavailable"
        }
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
    if (rateLimitIdentity.clientId) {
      setLoginClientCookie(response, rateLimitIdentity.clientId);
    }
    return response;
  }

  const payload = await readJsonResponse(upstream);
  if (!upstream.ok || !payload) {
    const response = safeError(upstream.status, payload);
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter && /^\d+$/.test(retryAfter)) {
      response.headers.set("Retry-After", retryAfter);
    }
    if (rateLimitIdentity.clientId) {
      setLoginClientCookie(response, rateLimitIdentity.clientId);
    }
    return response;
  }

  const session = parseSessionPayload(payload);
  if (!session || session.user.role !== "SENDER") {
    const response = safeError(502, null);
    if (rateLimitIdentity.clientId) {
      setLoginClientCookie(response, rateLimitIdentity.clientId);
    }
    return response;
  }
  const response = NextResponse.json({ user: session.user }, { status: 201 });
  if (rateLimitIdentity.clientId) {
    setLoginClientCookie(response, rateLimitIdentity.clientId);
  }
  setSessionCookies(response, session);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
