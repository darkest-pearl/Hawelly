import { describe, expect, it } from "vitest";
import { resolveFundingWorkflowConfig } from "./config.js";

describe("funding workflow configuration", () => {
  it("uses bounded private-storage defaults outside production", () => {
    const config = resolveFundingWorkflowConfig({ NODE_ENV: "test", HOST: "127.0.0.1", PORT: "4000" }, "C:\\hawelly-test");
    expect(config.publicBaseUrl).toBe("http://127.0.0.1:4000");
    expect(config.maximumProofBytes).toBe(8 * 1024 * 1024);
    expect(config.allowedContentTypes).not.toContain("image/svg+xml");
  });

  it("requires explicit private-storage production settings", () => {
    expect(() => resolveFundingWorkflowConfig({ NODE_ENV: "production", EVIDENCE_PUBLIC_BASE_URL: "https://api.example.com" })).toThrow(/SIGNING_SECRET/);
    expect(() => resolveFundingWorkflowConfig({
      NODE_ENV: "production",
      EVIDENCE_SIGNING_SECRET: "a-production-secret-that-is-long-enough",
      EVIDENCE_PUBLIC_BASE_URL: "https://api.example.com/path",
      EVIDENCE_STORAGE_ROOT: "C:\\private-evidence"
    })).toThrow(/exact HTTP/);
    expect(() => resolveFundingWorkflowConfig({
      NODE_ENV: "production",
      EVIDENCE_SIGNING_SECRET: "a-production-secret-that-is-long-enough",
      EVIDENCE_PUBLIC_BASE_URL: "http://api.example.com",
      EVIDENCE_STORAGE_ROOT: "C:\\private-evidence"
    })).toThrow(/HTTPS/);
    expect(() => resolveFundingWorkflowConfig({
      NODE_ENV: "production",
      EVIDENCE_SIGNING_SECRET: "a-production-secret-that-is-long-enough",
      EVIDENCE_PUBLIC_BASE_URL: "https://api.example.com"
    })).toThrow(/STORAGE_ROOT/);
    expect(() => resolveFundingWorkflowConfig({
      NODE_ENV: "production",
      EVIDENCE_SIGNING_SECRET: "a-production-secret-that-is-long-enough",
      EVIDENCE_PUBLIC_BASE_URL: "https://api.example.com",
      EVIDENCE_STORAGE_ROOT: ".local/evidence"
    })).toThrow(/absolute/);
  });

  it("rejects the documented placeholder and reused authentication secrets", () => {
    expect(() => resolveFundingWorkflowConfig({
      NODE_ENV: "production",
      EVIDENCE_PUBLIC_BASE_URL: "https://api.example.com",
      EVIDENCE_STORAGE_ROOT: "C:\\private-evidence",
      EVIDENCE_SIGNING_SECRET: "replace-with-a-distinct-32-character-secret"
    })).toThrow(/placeholder/);
    const reused = "a-distinct-looking-secret-with-at-least-32-bytes";
    expect(() => resolveFundingWorkflowConfig({
      NODE_ENV: "production",
      EVIDENCE_PUBLIC_BASE_URL: "https://api.example.com",
      EVIDENCE_STORAGE_ROOT: "C:\\private-evidence",
      EVIDENCE_SIGNING_SECRET: reused,
      AUTH_ACCESS_SECRET: reused
    })).toThrow(/distinct/);
  });
});
