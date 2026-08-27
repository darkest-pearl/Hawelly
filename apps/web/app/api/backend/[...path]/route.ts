import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAllowedBackendRequest } from "../../../../lib/backend-policy";
import {
  ACCESS_COOKIE,
  apiUrl,
  clearSessionCookies,
  readJsonResponse,
  requestIdHeaders,
  safeError,
  sameOriginMutation,
  UPSTREAM_TIMEOUT_MS
} from "../../../../lib/server-api";

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function proxy(request: NextRequest, context: RouteContext) {
  const path = (await context.params).path.join("/");
  if (!isAllowedBackendRequest(path, request.method)) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 }
    );
  }
  if (!["GET", "HEAD"].includes(request.method) && !sameOriginMutation(request)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Forbidden" } },
      { status: 403 }
    );
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED", message: "Authentication required" } },
      { status: 401 }
    );
  }
  const url = apiUrl(`/${path}`);
  url.search = request.nextUrl.search;
  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.text();
  const upstream = await fetch(url, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      "X-Client-Source": "WEB",
      ...requestIdHeaders(request)
    },
    ...(body ? { body } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  });
  const payload = upstream.status === 204 ? null : await readJsonResponse(upstream);
  if (!upstream.ok) {
    const response = safeError(upstream.status, payload);
    if (upstream.status === 401) clearSessionCookies(response);
    return response;
  }
  const response = payload
    ? NextResponse.json(payload, { status: upstream.status })
    : new NextResponse(null, { status: upstream.status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
