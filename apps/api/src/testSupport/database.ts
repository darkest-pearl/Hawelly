const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function resolveTestDatabaseUrl(rawValue: string | undefined) {
  const value = rawValue?.trim();
  if (!value) return undefined;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("TEST_DATABASE_URL must be an absolute PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("TEST_DATABASE_URL must use postgres:// or postgresql://");
  }
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("TEST_DATABASE_URL must target a loopback PostgreSQL host");
  }

  const databaseName = decodeURIComponent(url.pathname.slice(1)).toLowerCase();
  if (!/(^|[_-])test($|[_-])/.test(databaseName)) {
    throw new Error("TEST_DATABASE_URL database name must contain a test segment");
  }
  return value;
}
