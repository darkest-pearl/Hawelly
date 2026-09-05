import { isAbsolute } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { exactOrigin, loadEnvFiles, parseOptions, requireStrongSecret } from "./lib.mjs";

function requireValue(environment, name) {
  const value = environment[name]?.trim() || "";
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function validateDatabaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("DATABASE_URL must be an absolute PostgreSQL URL"); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error("DATABASE_URL must use PostgreSQL");
  if (!url.hostname || !url.pathname || url.pathname === "/") throw new Error("DATABASE_URL must identify a server and database");
  if (/replace|example|local-only/i.test(value)) throw new Error("DATABASE_URL must not use an example placeholder");
}

function validateAndroidUpdate(environment) {
  const download = environment.ANDROID_UPDATE_DOWNLOAD_URL?.trim() || "";
  const digest = environment.ANDROID_UPDATE_SHA256?.trim() || "";
  if (Boolean(download) !== Boolean(digest)) throw new Error("Android update URL and SHA-256 must be configured together");
  if (download) {
    const url = new URL(download);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("ANDROID_UPDATE_DOWNLOAD_URL must be an HTTPS URL without credentials");
    if (!/^[a-f0-9]{64}$/i.test(digest)) throw new Error("ANDROID_UPDATE_SHA256 must be a 64-character hexadecimal digest");
  }
}

function validateServerApiOrigin(value) {
  const origin = exactOrigin(value, "HAWELLY_API_URL");
  const url = new URL(origin);
  if (url.protocol === "https:") return;
  if (url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname)) return;
  throw new Error("HAWELLY_API_URL must use HTTPS or exact HTTP loopback");
}

export function auditReleaseEnvironment(apiEnvironment, webEnvironment) {
  const errors = [];
  const check = (operation) => { try { operation(); } catch (error) { errors.push(error.message); } };
  check(() => { if (apiEnvironment.NODE_ENV !== "production") throw new Error("API NODE_ENV must be production"); });
  check(() => validateDatabaseUrl(requireValue(apiEnvironment, "DATABASE_URL")));
  const secrets = [];
  for (const name of ["AUTH_ACCESS_SECRET", "AUTH_RATE_LIMIT_PEPPER", "EVIDENCE_SIGNING_SECRET"]) {
    check(() => secrets.push(requireStrongSecret(apiEnvironment, name)));
  }
  check(() => { if (secrets.length === 3 && new Set(secrets).size !== 3) throw new Error("Authentication and evidence secrets must be distinct"); });
  check(() => exactOrigin(requireValue(apiEnvironment, "EVIDENCE_PUBLIC_BASE_URL"), "EVIDENCE_PUBLIC_BASE_URL", { https: true }));
  check(() => {
    const root = requireValue(apiEnvironment, "EVIDENCE_STORAGE_ROOT");
    if (!isAbsolute(root)) throw new Error("EVIDENCE_STORAGE_ROOT must be absolute in production");
  });
  check(() => {
    const origins = requireValue(apiEnvironment, "CORS_ORIGINS").split(",").map((value) => value.trim()).filter(Boolean);
    if (!origins.length) throw new Error("CORS_ORIGINS must contain at least one origin");
    for (const origin of origins) exactOrigin(origin, "CORS_ORIGINS", { https: true });
  });
  check(() => {
    const addresses = requireValue(apiEnvironment, "TRUSTED_BFF_ADDRESSES").split(",").map((value) => value.trim()).filter(Boolean);
    if (!addresses.length || addresses.some((value) => /[\s/]/.test(value))) throw new Error("TRUSTED_BFF_ADDRESSES must contain exact peer addresses");
  });
  check(() => validateAndroidUpdate(apiEnvironment));
  check(() => { if (webEnvironment.NODE_ENV !== "production") throw new Error("Web NODE_ENV must be production"); });
  check(() => validateServerApiOrigin(requireValue(webEnvironment, "HAWELLY_API_URL")));
  check(() => exactOrigin(requireValue(webEnvironment, "HAWELLY_WEB_ORIGIN"), "HAWELLY_WEB_ORIGIN", { https: true }));
  check(() => {
    const header = requireValue(webEnvironment, "HAWELLY_CLIENT_IP_HEADER").toLowerCase();
    if (!/^[a-z0-9-]+$/.test(header)) throw new Error("HAWELLY_CLIENT_IP_HEADER must name a trusted ingress header");
  });
  return errors;
}

export async function runReleaseAudit(argumentsList = process.argv.slice(2)) {
  const { options } = parseOptions(argumentsList);
  const apiFile = String(options.get("api-env") || "apps/api/.env");
  const webFile = String(options.get("web-env") || "apps/web/.env");
  const apiEnvironment = await loadEnvFiles([apiFile], {});
  const webEnvironment = await loadEnvFiles([webFile], {});
  const errors = auditReleaseEnvironment(apiEnvironment, webEnvironment);
  if (errors.length) {
    console.error("Release environment audit failed:");
    for (const error of errors) console.error(`- ${error}`);
    return 1;
  }
  console.log(`Release environment audit passed (${apiFile}, ${webFile}); secret values were not printed.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReleaseAudit().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`release-audit: ${error.message}`);
    process.exitCode = 1;
  });
}
