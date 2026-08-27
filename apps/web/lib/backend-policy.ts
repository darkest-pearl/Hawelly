const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const routeRules = [
  { pattern: /^me$/, methods: ["GET"] },
  { pattern: /^recipients$/, methods: ["GET", "POST"] },
  { pattern: new RegExp(`^recipients/${UUID_PATTERN.source.slice(1, -1)}$`, "i"), methods: ["GET", "PATCH", "DELETE"] },
  { pattern: /^transfers$/, methods: ["GET", "POST"] },
  { pattern: new RegExp(`^transfers/${UUID_PATTERN.source.slice(1, -1)}$`, "i"), methods: ["GET"] },
  { pattern: new RegExp(`^transfers/${UUID_PATTERN.source.slice(1, -1)}/cancel$`, "i"), methods: ["POST"] },
  { pattern: /^operations\/transfers$/, methods: ["GET"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}$`, "i"), methods: ["GET"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/review$`, "i"), methods: ["POST"] }
] as const;

export function isAllowedBackendRequest(path: string, method: string) {
  return routeRules.some(
    (rule) => rule.pattern.test(path) && rule.methods.includes(method as never)
  );
}

export function resolveApiBaseUrl(rawValue: string | undefined) {
  const value = rawValue?.trim() || "http://127.0.0.1:4000";
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("HAWELLY_API_URL must use http or https");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("HAWELLY_API_URL must be an exact origin without credentials");
  }
  return url.origin;
}

export function hasSameOriginHost(requestOrigin: string | null, requestHost: string | null) {
  if (!requestOrigin || !requestHost) return false;
  try {
    const origin = new URL(requestOrigin);
    return ["http:", "https:"].includes(origin.protocol) && origin.host === requestHost;
  } catch {
    return false;
  }
}
