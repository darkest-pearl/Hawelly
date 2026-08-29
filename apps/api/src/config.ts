const DEFAULT_PORT = 4000;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_CORS_ORIGINS = [
  "http://127.0.0.1:3000",
  "http://localhost:3000"
];
const DEFAULT_TRUSTED_BFF_ADDRESSES = [
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1"
];

export interface RuntimeConfig {
  host: string;
  port: number;
  environment: string;
  corsOrigins: readonly string[];
  trustedBffAddresses: readonly string[];
  androidUpdate: AndroidUpdateConfig;
}

export interface AndroidUpdateConfig {
  latestVersionCode: number;
  latestVersionName: string;
  minimumSupportedVersionCode: number;
  downloadUrl: string | null;
  sha256: string | null;
  releaseNotes: string | null;
}

function parsePositiveInteger(name: string, value: string | undefined, fallback: number) {
  const candidate = value?.trim() || String(fallback);
  if (!/^\d+$/.test(candidate)) {
    throw new Error(`${name} must be a positive integer`);
  }
  const parsed = Number(candidate);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseAndroidUpdateConfig(environment: NodeJS.ProcessEnv): AndroidUpdateConfig {
  const latestVersionCode = parsePositiveInteger(
    "ANDROID_UPDATE_LATEST_VERSION_CODE",
    environment.ANDROID_UPDATE_LATEST_VERSION_CODE,
    1
  );
  const minimumSupportedVersionCode = parsePositiveInteger(
    "ANDROID_UPDATE_MINIMUM_SUPPORTED_VERSION_CODE",
    environment.ANDROID_UPDATE_MINIMUM_SUPPORTED_VERSION_CODE,
    1
  );
  if (minimumSupportedVersionCode > latestVersionCode) {
    throw new Error("Android minimum supported version cannot exceed latest version");
  }

  const latestVersionName = environment.ANDROID_UPDATE_LATEST_VERSION_NAME?.trim() || "1.0.0";
  if (latestVersionName.length > 64 || !/^[0-9A-Za-z][0-9A-Za-z._+-]*$/.test(latestVersionName)) {
    throw new Error("ANDROID_UPDATE_LATEST_VERSION_NAME is invalid");
  }

  const rawDownloadUrl = environment.ANDROID_UPDATE_DOWNLOAD_URL?.trim();
  let downloadUrl: string | null = null;
  if (rawDownloadUrl) {
    const parsed = new URL(rawDownloadUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      throw new Error("ANDROID_UPDATE_DOWNLOAD_URL must be an HTTPS URL without credentials");
    }
    downloadUrl = parsed.toString();
  }

  const rawSha256 = environment.ANDROID_UPDATE_SHA256?.trim().toLowerCase();
  const sha256 = rawSha256 || null;
  if ((downloadUrl === null) !== (sha256 === null) || (sha256 && !/^[a-f0-9]{64}$/.test(sha256))) {
    throw new Error("Android update URL and a valid SHA-256 digest must be configured together");
  }

  const releaseNotes = environment.ANDROID_UPDATE_RELEASE_NOTES?.trim() || null;
  if (releaseNotes && releaseNotes.length > 2_000) {
    throw new Error("ANDROID_UPDATE_RELEASE_NOTES must be 2000 characters or fewer");
  }

  return {
    latestVersionCode,
    latestVersionName,
    minimumSupportedVersionCode,
    downloadUrl,
    sha256,
    releaseNotes
  };
}

function parseTrustedBffAddresses(value: string | undefined) {
  const addresses = value
    ? value.split(",").map((address) => address.trim()).filter(Boolean)
    : DEFAULT_TRUSTED_BFF_ADDRESSES;
  if (addresses.some((address) => /[\s/]/.test(address))) {
    throw new Error("TRUSTED_BFF_ADDRESSES must contain exact peer addresses");
  }
  return [...new Set(addresses)];
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_PORT;
  }

  if (!/^\d+$/.test(value.trim())) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}

function parseEnvironment(value: string | undefined) {
  const environment = value?.trim() || "development";
  if (!["development", "test", "production"].includes(environment)) {
    throw new Error("NODE_ENV must be development, test, or production");
  }
  return environment;
}

function parseCorsOrigins(value: string | undefined): readonly string[] {
  const candidates = value
    ? value.split(",").map((origin) => origin.trim()).filter(Boolean)
    : DEFAULT_CORS_ORIGINS;

  return candidates.map((candidate) => {
    const origin = new URL(candidate);
    if (!["http:", "https:"].includes(origin.protocol)) {
      throw new Error("CORS origins must use http or https");
    }
    if (origin.username || origin.password || origin.origin !== candidate) {
      throw new Error("CORS origins must be exact origins without credentials or paths");
    }
    return origin.origin;
  });
}

export function resolveRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env
): RuntimeConfig {
  return {
    host: environment.HOST?.trim() || DEFAULT_HOST,
    port: parsePort(environment.PORT),
    environment: parseEnvironment(environment.NODE_ENV),
    corsOrigins: parseCorsOrigins(environment.CORS_ORIGINS),
    trustedBffAddresses: parseTrustedBffAddresses(
      environment.TRUSTED_BFF_ADDRESSES
    ),
    androidUpdate: parseAndroidUpdateConfig(environment)
  };
}
