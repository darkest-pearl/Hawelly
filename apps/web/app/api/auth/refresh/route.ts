import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  apiUrl,
  clearSessionCookies,
  readJsonResponse,
  parseSessionPayload,
  REFRESH_COOKIE,
  requestIdHeaders,
  safeError,
  sameOriginMutation,
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
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED", message: "Authentication required" } },
      { status: 401 }
    );
  }
  const upstream = await fetch(apiUrl("/auth/refresh"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Source": "WEB",
      ...requestIdHeaders(request)
    },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  });
  const payload = await readJsonResponse(upstream);
  const session = parseSessionPayload(payload);
  if (!upstream.ok || !session) {
    const response = safeError(upstream.status, payload);
    clearSessionCookies(response);
    return response;
  }
  const response = NextResponse.json({ user: session.user });
  setSessionCookies(response, session);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
