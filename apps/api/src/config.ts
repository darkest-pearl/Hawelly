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
    environment: environment.NODE_ENV?.trim() || "development",
    corsOrigins: parseCorsOrigins(environment.CORS_ORIGINS),
    trustedBffAddresses: parseTrustedBffAddresses(
      environment.TRUSTED_BFF_ADDRESSES
    )
  };
}
