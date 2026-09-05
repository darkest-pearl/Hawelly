import { spawn } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseOptions, positiveInteger, secretSummary } from "./lib.mjs";

const SECRET_KEYS = ["DATABASE_URL", "BACKUP_DATABASE_URL", "AUTH_ACCESS_SECRET", "AUTH_RATE_LIMIT_PEPPER", "EVIDENCE_SIGNING_SECRET"];
const SAFE_KEYS = ["NODE_ENV", "HOST", "PORT", "HAWELLY_API_URL", "HAWELLY_WEB_ORIGIN", "HAWELLY_CLIENT_IP_HEADER", "EVIDENCE_STORAGE_ROOT"];

export function summarizePm2Environment(environment) {
  return Object.fromEntries([
    ...SAFE_KEYS.map((key) => [key, environment[key] || "missing"]),
    ...SECRET_KEYS.map((key) => [key, secretSummary(environment[key] || "")])
  ]);
}

function pm2List(timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["node_modules/pm2/bin/pm2", "jlist"], { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    timer.unref();
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`pm2 jlist failed${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
      else resolve(JSON.parse(stdout));
    });
  });
}

export async function runPm2EnvInspect(argumentsList = process.argv.slice(2)) {
  const { options } = parseOptions(argumentsList);
  const processName = String(options.get("process") || "");
  if (!processName) throw new Error("--process is required");
  const processes = await pm2List(positiveInteger(options.get("timeout-ms"), 10_000, "timeout", 60_000));
  const application = processes.find((item) => item.name === processName);
  if (!application) throw new Error(`PM2 process ${processName} was not found`);
  console.log(JSON.stringify({ process: processName, status: application.pm2_env?.status, environment: summarizePm2Environment(application.pm2_env || {}) }, null, 2));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPm2EnvInspect().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`pm2-env-inspect: ${error.message}`);
    process.exitCode = 1;
  });
}
