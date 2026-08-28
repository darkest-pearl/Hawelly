const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const routeRules = [
  { pattern: /^me$/, methods: ["GET"] },
  { pattern: /^recipients$/, methods: ["GET", "POST"] },
  { pattern: new RegExp(`^recipients/${UUID_PATTERN.source.slice(1, -1)}$`, "i"), methods: ["GET", "PATCH", "DELETE"] },
  { pattern: /^transfers$/, methods: ["GET", "POST"] },
  { pattern: new RegExp(`^transfers/${UUID_PATTERN.source.slice(1, -1)}$`, "i"), methods: ["GET"] },
  { pattern: new RegExp(`^transfers/${UUID_PATTERN.source.slice(1, -1)}/cancel$`, "i"), methods: ["POST"] },
  { pattern: new RegExp(`^transfers/${UUID_PATTERN.source.slice(1, -1)}/quotes$`, "i"), methods: ["GET"] },
  { pattern: new RegExp(`^transfers/${UUID_PATTERN.source.slice(1, -1)}/quotes/${UUID_PATTERN.source.slice(1, -1)}/decision$`, "i"), methods: ["POST"] },
  { pattern: new RegExp(`^transfers/${UUID_PATTERN.source.slice(1, -1)}/funding$`, "i"), methods: ["GET"] },
  { pattern: new RegExp(`^transfers/${UUID_PATTERN.source.slice(1, -1)}/funding-proofs$`, "i"), methods: ["POST"] },
  { pattern: new RegExp(`^transfers/${UUID_PATTERN.source.slice(1, -1)}/funding-proofs/${UUID_PATTERN.source.slice(1, -1)}/read-url$`, "i"), methods: ["POST"] },
  { pattern: new RegExp(`^transfers/${UUID_PATTERN.source.slice(1, -1)}/payout$`, "i"), methods: ["GET"] },
  { pattern: new RegExp(`^transfers/${UUID_PATTERN.source.slice(1, -1)}/resolution$`, "i"), methods: ["GET"] },
  { pattern: new RegExp(`^transfers/${UUID_PATTERN.source.slice(1, -1)}/recipient-confirmation$`, "i"), methods: ["POST"] },
  { pattern: new RegExp(`^transfers/${UUID_PATTERN.source.slice(1, -1)}/disputes$`, "i"), methods: ["POST"] },
  { pattern: /^operations\/transfers$/, methods: ["GET"] },
  { pattern: /^operations\/funding-templates$/, methods: ["GET"] },
  { pattern: /^operations\/associates$/, methods: ["GET", "POST"] },
  { pattern: new RegExp(`^operations/associates/${UUID_PATTERN.source.slice(1, -1)}$`, "i"), methods: ["PATCH"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}$`, "i"), methods: ["GET"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/review$`, "i"), methods: ["POST"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/quotes$`, "i"), methods: ["GET", "POST"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/quotes/${UUID_PATTERN.source.slice(1, -1)}/send$`, "i"), methods: ["POST"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/funding$`, "i"), methods: ["GET"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/funding-instruction$`, "i"), methods: ["POST"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/funding-proofs/${UUID_PATTERN.source.slice(1, -1)}/read-url$`, "i"), methods: ["POST"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/funding-proofs/${UUID_PATTERN.source.slice(1, -1)}/review$`, "i"), methods: ["POST"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/funds-confirmation$`, "i"), methods: ["POST"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/payout$`, "i"), methods: ["GET"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/payout-case$`, "i"), methods: ["POST", "PATCH"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/payout-evidence$`, "i"), methods: ["POST"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/payout-evidence/${UUID_PATTERN.source.slice(1, -1)}/read-url$`, "i"), methods: ["POST"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/payout-report$`, "i"), methods: ["POST"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/payout-(hold|release)$`, "i"), methods: ["POST"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/resolution$`, "i"), methods: ["GET"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/(confirmation-request|admin-completion|refund|refund-confirmation)$`, "i"), methods: ["POST"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/disputes$`, "i"), methods: ["POST"] },
  { pattern: new RegExp(`^operations/transfers/${UUID_PATTERN.source.slice(1, -1)}/disputes/${UUID_PATTERN.source.slice(1, -1)}/(review|resolve)$`, "i"), methods: ["POST"] }
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

export function hasSameOrigin(requestOrigin: string | null, expectedOrigin: string) {
  if (!requestOrigin) return false;
  try {
    const origin = new URL(requestOrigin);
    const expected = new URL(expectedOrigin);
    return (
      ["http:", "https:"].includes(origin.protocol) &&
      ["http:", "https:"].includes(expected.protocol) &&
      origin.origin === expected.origin
    );
  } catch {
    return false;
  }
}
