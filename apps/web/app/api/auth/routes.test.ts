import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";

function mutationRequest(path: string, init: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`https://app.example.com${path}`, {
    ...init,
    headers: {
      origin: "https://app.example.com",
      ...Object.fromEntries(new Headers(init?.headers).entries())
    }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web authentication routes", () => {
  it("rejects an oversized login before contacting the API", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await login(
      mutationRequest("/api/auth/login", {
        method: "POST",
        headers: { "Content-Length": "1048577" },
        body: "{}"
      })
    );
    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain(
      "hawelly_login_client="
    );
    expect(upstream).not.toHaveBeenCalled();
  });

  it("preserves logout cookies when server-side revocation is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const response = await logout(
      mutationRequest("/api/auth/logout", {
        method: "POST",
        headers: { cookie: "hawelly_refresh=refresh-token" }
      })
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("clears logout cookies only after server-side revocation succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const response = await logout(
      mutationRequest("/api/auth/logout", {
        method: "POST",
        headers: { cookie: "hawelly_refresh=refresh-token" }
      })
    );
    expect(response.status).toBe(204);
    const cookies = response.headers.get("set-cookie") || "";
    expect(cookies).toContain("hawelly_access=");
    expect(cookies).toContain("hawelly_refresh=");
  });
});
