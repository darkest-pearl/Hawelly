import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  expectedWebOrigin,
  loginRateLimitIdentity,
  readBoundedRequestBody,
  RequestBodyTooLargeError
} from "./server-api";

describe("web server API boundary", () => {
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
