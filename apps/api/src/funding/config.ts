import { resolve } from "node:path";

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_URL_TTL_SECONDS = 300;
const DEVELOPMENT_SIGNING_SECRET = "hawelly-development-evidence-signing-secret";

export const FUNDING_PROOF_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png"
] as const;

export interface FundingWorkflowConfig {
  storageRoot: string;
  publicBaseUrl: string;
  signingSecret: string;
  signedUrlTtlSeconds: number;
  maximumProofBytes: number;
  allowedContentTypes: readonly string[];
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number, name: string) {
  if (!value?.trim()) return fallback;
  if (!/^\d+$/.test(value.trim())) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function exactOrigin(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.origin !== value) {
    throw new Error("EVIDENCE_PUBLIC_BASE_URL must be an exact HTTP(S) origin");
  }
  return url.origin;
}

export function resolveFundingWorkflowConfig(
  environment: NodeJS.ProcessEnv = process.env,
  workingDirectory = process.cwd()
): FundingWorkflowConfig {
  const production = environment.NODE_ENV === "production";
  const signingSecret = environment.EVIDENCE_SIGNING_SECRET?.trim() || (production ? "" : DEVELOPMENT_SIGNING_SECRET);
  if (signingSecret.length < 32) throw new Error("EVIDENCE_SIGNING_SECRET must contain at least 32 characters");
  const configuredPublicBaseUrl = environment.EVIDENCE_PUBLIC_BASE_URL?.trim();
  if (production && !configuredPublicBaseUrl) throw new Error("EVIDENCE_PUBLIC_BASE_URL is required in production");
  const publicBaseUrl = exactOrigin(
    configuredPublicBaseUrl ||
      `http://${environment.HOST?.trim() || "127.0.0.1"}:${environment.PORT?.trim() || "4000"}`
  );
  if (production && !publicBaseUrl.startsWith("https://")) {
    throw new Error("EVIDENCE_PUBLIC_BASE_URL must use HTTPS in production");
  }
  const configuredStorageRoot = environment.EVIDENCE_STORAGE_ROOT?.trim();
  if (production && !configuredStorageRoot) throw new Error("EVIDENCE_STORAGE_ROOT is required in production");
  return {
    storageRoot: resolve(configuredStorageRoot || resolve(workingDirectory, ".local", "evidence")),
    publicBaseUrl,
    signingSecret,
    signedUrlTtlSeconds: boundedInteger(environment.EVIDENCE_SIGNED_URL_TTL_SECONDS, DEFAULT_URL_TTL_SECONDS, 60, 900, "EVIDENCE_SIGNED_URL_TTL_SECONDS"),
    maximumProofBytes: boundedInteger(environment.EVIDENCE_MAX_PROOF_BYTES, DEFAULT_MAX_BYTES, 1_024, 25 * 1024 * 1024, "EVIDENCE_MAX_PROOF_BYTES"),
    allowedContentTypes: FUNDING_PROOF_CONTENT_TYPES
  };
}
