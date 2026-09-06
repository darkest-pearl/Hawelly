import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";
import { POST as register } from "./register/route";
import { GET as status } from "./status/route";

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
  it("reports session presence without exposing the refresh token", async () => {
    const anonymous = status(
      new NextRequest("https://app.example.com/api/auth/status")
    );
    expect(await anonymous.json()).toEqual({ hasSession: false });
    const authenticated = status(
      new NextRequest("https://app.example.com/api/auth/status", {
        headers: { cookie: "hawelly_refresh=secret-refresh-token" }
      })
    );
    expect(await authenticated.json()).toEqual({ hasSession: true });
    expect(authenticated.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await status(
      new NextRequest("https://app.example.com/api/auth/status", {
        headers: { cookie: "hawelly_refresh=secret-refresh-token" }
      })
    ).json())).not.toContain("secret-refresh-token");
  });

  it("registers a sender through the trusted BFF and stores tokens only in cookies", async () => {
    const upstream = vi.fn().mockResolvedValue(
      Response.json(
        {
          accessToken: "access-token",
          refreshToken: "refresh-token",
          accessExpiresInSeconds: 900,
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          user: {
            id: "00000000-0000-4000-8000-000000000001",
            fullName: "Sender One",
            email: "sender@example.com",
            role: "SENDER",
            status: "ACTIVE"
          }
        },
        { status: 201 }
      )
    );
    vi.stubGlobal("fetch", upstream);
    const response = await register(
      mutationRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          fullName: "  Sender One  ",
          email: "  sender@example.com  ",
          password: "A-secure-password-123"
        })
      })
    );

    expect(response.status).toBe(201);
    const responseBody = await response.json();
    expect(responseBody).toEqual({
      user: expect.objectContaining({ role: "SENDER" })
    });
    expect(upstream).toHaveBeenCalledOnce();
    const [, init] = upstream.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      fullName: "Sender One",
      email: "sender@example.com",
      password: "A-secure-password-123"
    });
    expect(new Headers(init.headers).get("x-client-source")).toBe("WEB");
    const cookies = response.headers.get("set-cookie") || "";
    expect(cookies).toContain("hawelly_access=access-token");
    expect(cookies).toContain("hawelly_refresh=refresh-token");
    expect(cookies.toLowerCase()).toContain("httponly");
    expect(cookies.toLowerCase()).toContain("samesite=strict");
    expect(cookies).toContain("hawelly_login_client=");
    expect(cookies.toLowerCase()).toContain("path=/api/auth");
    expect(JSON.stringify(responseBody)).not.toContain("access-token");
  });

  it.each([
    ["malformed JSON", "{not-json"],
    [
      "role injection",
      JSON.stringify({
        fullName: "Role Injection",
        email: "sender@example.com",
        password: "A-secure-password-123",
        role: "ADMIN"
      })
    ],
    [
      "capability injection",
      JSON.stringify({
        fullName: "Capability Injection",
        email: "sender@example.com",
        password: "A-secure-password-123",
        capabilities: ["STAFF_MANAGE"]
      })
    ]
  ])("rejects %s before contacting the API", async (_label, body) => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await register(
      mutationRequest("/api/auth/register", { method: "POST", body })
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects cross-origin and oversized registration before contacting the API", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const crossOrigin = new NextRequest("https://app.example.com/api/auth/register", {
      method: "POST",
      headers: { origin: "https://attacker.invalid" },
      body: "{}"
    });
    expect((await register(crossOrigin)).status).toBe(403);

    const oversized = await register(
      mutationRequest("/api/auth/register", {
        method: "POST",
        headers: { "Content-Length": "16385" },
        body: "{}"
      })
    );
    expect(oversized.status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects a non-sender registration response without setting session cookies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          accessToken: "access-token",
          refreshToken: "refresh-token",
          accessExpiresInSeconds: 900,
          refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          user: { role: "ADMIN" }
        })
      )
    );
    const response = await register(
      mutationRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          fullName: "Sender One",
          email: "sender@example.com",
          password: "A-secure-password-123"
        })
      })
    );
    expect(response.status).toBe(502);
    expect(response.headers.get("set-cookie")).toContain("hawelly_login_client=");
    expect(response.headers.get("set-cookie")).not.toContain("hawelly_access=");
  });

  it("preserves a safe upstream registration error and numeric retry guidance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { error: { code: "RATE_LIMITED", message: "Try again later" } },
          { status: 429, headers: { "Retry-After": "120" } }
        )
      )
    );
    const response = await register(
      mutationRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          fullName: "Sender One",
          email: "sender@example.com",
          password: "A-secure-password-123"
        })
      })
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("120");
    expect(await response.json()).toEqual({
      error: { code: "RATE_LIMITED", message: "Try again later" }
    });
  });

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
