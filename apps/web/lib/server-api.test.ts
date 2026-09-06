import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expectedWebOrigin,
  loginRateLimitIdentity,
  parseSenderRegistration,
  readBoundedRequestBody,
  RequestBodyTooLargeError,
  setSessionCookies
} from "./server-api";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("web server API boundary", () => {
  it("uses secure HTTP-only strict cookies in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = NextResponse.json({ ok: true });
    setSessionCookies(response, {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessExpiresInSeconds: 900,
      refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      user: { role: "SENDER" }
    });
    const cookies = response.headers.get("set-cookie")?.toLowerCase() || "";
    expect(cookies).toContain("secure");
    expect(cookies).toContain("httponly");
    expect(cookies).toContain("samesite=strict");
    expect(cookies).toContain("path=/api/backend");
    expect(cookies).toContain("path=/api/auth");
  });

  it("accepts only the exact public sender registration shape", () => {
    expect(
      parseSenderRegistration(
        JSON.stringify({
          fullName: "  Sender One ",
          email: " sender@example.com ",
          password: "A-secure-password-123"
        })
      )
    ).toEqual({
      fullName: "Sender One",
      email: "sender@example.com",
      password: "A-secure-password-123"
    });
    expect(
      parseSenderRegistration(
        JSON.stringify({
          fullName: "Sender One",
          email: "sender@example.com",
          password: "A-secure-password-123",
          role: "ADMIN"
        })
      )
    ).toBeNull();
  });

  it("reads bodies through the configured byte boundary", async () => {
    const request = new Request("https://app.example.com/api/backend/transfers", {
      method: "POST",
      body: "12345"
    });
    await expect(readBoundedRequestBody(request, 5)).resolves.toBe("12345");
  });

  it("rejects declared and streamed oversized bodies", async () => {
    const declared = new Request("https://app.example.com/api/auth/login", {
      method: "POST",
      headers: { "Content-Length": "6" },
      body: "123456"
    });
    await expect(readBoundedRequestBody(declared, 5)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError
    );

    const streamed = new Request("https://app.example.com/api/auth/login", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("123"));
          controller.enqueue(new TextEncoder().encode("456"));
          controller.close();
        }
      }),
      duplex: "half"
    } as RequestInit & { duplex: "half" });
    await expect(readBoundedRequestBody(streamed, 5)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError
    );
  });

  it("reuses only valid version-4 login client identifiers", () => {
    const valid = "00000000-0000-4000-8000-000000000001";
    const existing = new NextRequest("https://app.example.com/api/auth/login", {
      headers: { cookie: `hawelly_login_client=${valid}` }
    });
    expect(loginRateLimitIdentity(existing, { NODE_ENV: "test" })).toEqual({
      value: `client:${valid}`,
      clientId: valid
    });

    const invalid = new NextRequest("https://app.example.com/api/auth/login", {
      headers: { cookie: "hawelly_login_client=attacker-controlled" }
    });
    expect(loginRateLimitIdentity(invalid, { NODE_ENV: "test" }).value).toMatch(
      /^client:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("requires an exact trusted-ingress client IP in production", () => {
    const request = new NextRequest("https://app.example.com/api/auth/login", {
      headers: { "x-real-ip": "203.0.113.20" }
    });
    expect(
      loginRateLimitIdentity(request, {
        NODE_ENV: "production",
        HAWELLY_CLIENT_IP_HEADER: "x-real-ip"
      })
    ).toEqual({ value: "ip:203.0.113.20" });
    expect(() =>
      loginRateLimitIdentity(request, { NODE_ENV: "production" })
    ).toThrow("HAWELLY_CLIENT_IP_HEADER");
    expect(() =>
      loginRateLimitIdentity(
        new NextRequest("https://app.example.com/api/auth/login", {
          headers: { "x-real-ip": "203.0.113.20, 10.0.0.1" }
        }),
        { NODE_ENV: "production", HAWELLY_CLIENT_IP_HEADER: "x-real-ip" }
      )
    ).toThrow("exact client IP");
  });

  it("resolves development and production web origins without ignoring scheme", () => {
    const request = new NextRequest("http://internal:3100/api/auth/login", {
      headers: { host: "127.0.0.1:3100" }
    });
    expect(expectedWebOrigin(request, { NODE_ENV: "development" })).toBe(
      "http://127.0.0.1:3100"
    );
    expect(
      expectedWebOrigin(request, {
        NODE_ENV: "production",
        HAWELLY_WEB_ORIGIN: "https://app.example.com"
      })
    ).toBe("https://app.example.com");
    expect(() => expectedWebOrigin(request, { NODE_ENV: "production" })).toThrow(
      "HAWELLY_WEB_ORIGIN"
    );
  });
});
