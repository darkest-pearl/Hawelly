import process from "node:process";
import { pathToFileURL } from "node:url";
import { exactOrigin, parseOptions, positiveInteger } from "./lib.mjs";

const HEALTH_PATHS = ["/health", "/health/ready", "/health/storage"];

export async function checkHealth(origin, { timeoutMs = 5_000, fetchImplementation = fetch } = {}) {
  const baseUrl = exactOrigin(origin, "HAWELLY_API_URL");
  const results = [];
  for (const path of HEALTH_PATHS) {
    const response = await fetchImplementation(new URL(path, baseUrl), {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok !== true || payload.service !== "hawelly-api") {
      throw new Error(`${path} failed with HTTP ${response.status}`);
    }
    results.push({ path, status: response.status });
  }
  return results;
}

export async function runHealthCheck(argumentsList = process.argv.slice(2)) {
  const { options } = parseOptions(argumentsList);
  const origin = String(options.get("url") || process.env.HAWELLY_API_URL || "");
  if (!origin) throw new Error("Provide --url or HAWELLY_API_URL");
  const timeoutMs = positiveInteger(options.get("timeout-ms"), 5_000, "timeout", 60_000);
  const results = await checkHealth(origin, { timeoutMs });
  for (const result of results) console.log(`${result.path}: HTTP ${result.status}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runHealthCheck().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`health-check: ${error.message}`);
    process.exitCode = 1;
  });
}
