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
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
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

  it("maps malformed and oversized JSON bodies without exposing parser errors", async () => {
    const app = createApp(testConfig);
    const malformed = await request(app)
      .post("/missing")
      .set("Content-Type", "application/json")
      .send('{"broken":');
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({
      error: { code: "INVALID_JSON", message: "Request body must be valid JSON" }
    });

    const oversized = await request(app)
      .post("/missing")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ value: "x".repeat(1_048_576) }));
    expect(oversized.status).toBe(413);
    expect(oversized.body.error.code).toBe("BODY_TOO_LARGE");
  });

  it("returns no-store Android update metadata for the requesting version", async () => {
    const config = resolveRuntimeConfig({
      NODE_ENV: "test",
      ANDROID_UPDATE_LATEST_VERSION_CODE: "4",
      ANDROID_UPDATE_LATEST_VERSION_NAME: "1.3.0",
      ANDROID_UPDATE_MINIMUM_SUPPORTED_VERSION_CODE: "3",
      ANDROID_UPDATE_DOWNLOAD_URL: "https://downloads.example.com/hawelly-1.3.0.apk",
      ANDROID_UPDATE_SHA256: "a".repeat(64),
      ANDROID_UPDATE_RELEASE_NOTES: "Security and reliability update"
    });
    const response = await request(createApp(config)).get(
      "/app-updates/android?versionCode=2"
    );

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({
      platform: "android",
      latestVersionCode: 4,
      latestVersionName: "1.3.0",
      minimumSupportedVersionCode: 3,
      updateAvailable: true,
      updateRequired: true,
      downloadUrl: "https://downloads.example.com/hawelly-1.3.0.apk",
      sha256: "a".repeat(64),
      releaseNotes: "Security and reliability update"
    });
  });

  it("rejects missing or invalid Android version codes", async () => {
    const app = createApp(testConfig);
    expect((await request(app).get("/app-updates/android")).status).toBe(400);
    expect(
      (await request(app).get("/app-updates/android?versionCode=0")).body.error.code
    ).toBe("INVALID_VERSION_CODE");
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

  it("rejects environment names that could activate development security defaults", () => {
    expect(() => resolveRuntimeConfig({ NODE_ENV: "prod" })).toThrow(
      "NODE_ENV must be development, test, or production"
    );
  });

  it("validates Android update integrity metadata", () => {
    expect(() =>
      resolveRuntimeConfig({
        ANDROID_UPDATE_LATEST_VERSION_CODE: "2",
        ANDROID_UPDATE_MINIMUM_SUPPORTED_VERSION_CODE: "3"
      })
    ).toThrow("minimum supported version");
    expect(() =>
      resolveRuntimeConfig({
        ANDROID_UPDATE_DOWNLOAD_URL: "http://downloads.example.com/app.apk",
        ANDROID_UPDATE_SHA256: "a".repeat(64)
      })
    ).toThrow("HTTPS URL");
    expect(() =>
      resolveRuntimeConfig({
        ANDROID_UPDATE_DOWNLOAD_URL: "https://downloads.example.com/app.apk"
      })
    ).toThrow("configured together");
  });
});
