import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  apiUrl,
  clearSessionCookies,
  REFRESH_COOKIE,
  requestIdHeaders,
  sameOriginMutation,
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
  if (refreshToken) {
    let upstream: Response;
    try {
      upstream = await fetch(apiUrl("/auth/logout"), {
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
    } catch {
      const response = NextResponse.json(
        {
          error: {
            code: "UPSTREAM_UNAVAILABLE",
            message: "Sign out could not be completed"
          }
        },
        { status: 503 }
      );
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    if (!upstream.ok) {
      const response = NextResponse.json(
        {
          error: {
            code: "UPSTREAM_ERROR",
            message: "Sign out could not be completed"
          }
        },
        {
          status:
            upstream.status >= 400 && upstream.status <= 599
              ? upstream.status
              : 502
        }
      );
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
  }
  const response = new NextResponse(null, { status: 204 });
  clearSessionCookies(response);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
