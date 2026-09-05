import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  createRequestContextMiddleware,
  type ContextRequest
} from "./requestContext.js";

function testApp(trustedAddresses: readonly string[]) {
  const app = express();
  app.use(createRequestContextMiddleware(trustedAddresses));
  app.get("/", (rawRequest, response) => {
    const context = (rawRequest as ContextRequest).requestContext;
    response.json(context);
  });
  return app;
}

describe("request context proxy boundary", () => {
  it("uses an exact proxy-supplied client IP from a trusted peer", async () => {
    const response = await request(
      testApp(["127.0.0.1", "::1", "::ffff:127.0.0.1"])
    )
      .get("/")
      .set("X-Client-Source", "ANDROID")
      .set("X-Real-IP", "203.0.113.20");

    expect(response.status).toBe(200);
    expect(response.body.ipAddress).toBe("203.0.113.20");
    expect(response.body.rateLimitAddress).toBe("proxy-ip:203.0.113.20");
    expect(response.body.source).toBe("ANDROID");
  });

  it("ignores proxy headers from an untrusted peer", async () => {
    const response = await request(testApp([]))
      .get("/")
      .set("X-Client-Source", "ANDROID")
      .set("X-Real-IP", "203.0.113.20");

    expect(response.status).toBe(200);
    expect(response.body.ipAddress).not.toBe("203.0.113.20");
    expect(response.body.rateLimitAddress).not.toBe(
      "proxy-ip:203.0.113.20"
    );
  });

  it("keeps a valid trusted BFF identity authoritative", async () => {
    const response = await request(
      testApp(["127.0.0.1", "::1", "::ffff:127.0.0.1"])
    )
      .get("/")
      .set("X-Client-Source", "WEB")
      .set("X-Hawelly-BFF-Rate-Limit-Id", "ip:198.51.100.8")
      .set("X-Real-IP", "127.0.0.1");

    expect(response.status).toBe(200);
    expect(response.body.rateLimitAddress).toBe("web-ip:198.51.100.8");
  });
});
