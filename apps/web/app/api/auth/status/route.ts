import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { REFRESH_COOKIE } from "../../../../lib/server-api";

export function GET(request: NextRequest) {
  const response = NextResponse.json({
    hasSession: Boolean(request.cookies.get(REFRESH_COOKIE)?.value)
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
