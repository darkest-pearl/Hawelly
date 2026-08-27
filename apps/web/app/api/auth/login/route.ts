import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  apiUrl,
  parseSessionPayload,
  readJsonResponse,
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
  const body = await request.text();
  const upstream = await fetch(apiUrl("/auth/login"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Source": "WEB",
      ...requestIdHeaders(request)
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  });
  const payload = await readJsonResponse(upstream);
  if (!upstream.ok || !payload) return safeError(upstream.status, payload);
  const session = parseSessionPayload(payload);
  if (!session) return safeError(502, null);
  const response = NextResponse.json({ user: session.user }, { status: 200 });
  setSessionCookies(response, session);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
