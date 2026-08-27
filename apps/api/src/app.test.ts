import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { resolveRuntimeConfig } from "./config.js";

const testConfig = resolveRuntimeConfig({
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: "4000",
  CORS_ORIGINS: "http://localhost:3000"
});

describe("health routes", () => {
  it("returns a minimal liveness response without framework disclosure", async () => {
    const response = await request(createApp(testConfig)).get("/health");

    expect(response.status).toBe(200);
    expect(response.type).toBe("application/json");
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({ ok: true, service: "hawelly-api" });
  });

  it("returns a safe readiness response", async () => {
    const response = await request(createApp(testConfig)).get("/health/ready");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({
      ok: true,
      service: "hawelly-api",
      readiness: "ready"
    });
  });

  it("returns a safe JSON 404", async () => {
    const response = await request(createApp(testConfig)).get("/missing");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Not found" });
  });
});

describe("runtime configuration", () => {
  it("uses loopback and port 4000 by default", () => {
    const config = resolveRuntimeConfig({});

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(4000);
    expect(config.trustedBffAddresses).toContain("127.0.0.1");
  });

  it.each(["0", "65536", "1.5", "not-a-port"])(
    "rejects invalid PORT value %s",
    (port) => {
      expect(() => resolveRuntimeConfig({ PORT: port })).toThrow(
        "PORT must be an integer between 1 and 65535"
      );
    }
  );

  it("rejects credentialed or path-based CORS origins", () => {
    expect(() =>
      resolveRuntimeConfig({ CORS_ORIGINS: "https://user:pass@example.com" })
    ).toThrow();
    expect(() =>
      resolveRuntimeConfig({ CORS_ORIGINS: "https://example.com/path" })
    ).toThrow();
  });

  it("rejects non-exact trusted BFF peer addresses", () => {
    expect(() =>
      resolveRuntimeConfig({ TRUSTED_BFF_ADDRESSES: "127.0.0.1/8" })
    ).toThrow("TRUSTED_BFF_ADDRESSES must contain exact peer addresses");
  });
});
