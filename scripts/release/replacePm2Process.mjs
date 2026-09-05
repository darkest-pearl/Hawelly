import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const PROCESS_NAMES = new Set(["hawelly-api", "hawelly-web"]);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pm2Path = join(repositoryRoot, "node_modules", "pm2", "bin", "pm2");
const ecosystemPath = join(repositoryRoot, "ecosystem.config.cjs");

export function parseProcessName(argumentsList) {
  if (argumentsList.length !== 2 || argumentsList[0] !== "--process") {
    throw new Error("Usage: replacePm2Process.mjs --process <hawelly-api|hawelly-web>");
  }
  const name = argumentsList[1];
  if (!PROCESS_NAMES.has(name)) throw new Error("Unsupported PM2 process name");
  return name;
}

function runPm2(argumentsList, { quiet = false, acceptedStatuses = [0] } = {}) {
  const result = spawnSync(process.execPath, [pm2Path, ...argumentsList], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: quiet ? "ignore" : "inherit",
    timeout: 120_000,
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`PM2 terminated by ${result.signal}`);
  if (!acceptedStatuses.includes(result.status)) {
    throw new Error(`PM2 ${argumentsList[0]} exited ${result.status}`);
  }
  return result.status;
}

export function replacePm2Process(name) {
  const exists = runPm2(["describe", name], {
    quiet: true,
    acceptedStatuses: [0, 1]
  }) === 0;
  if (exists) runPm2(["delete", name]);
  runPm2(["start", ecosystemPath, "--only", name, "--update-env"]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    replacePm2Process(parseProcessName(process.argv.slice(2)));
  } catch (error) {
    console.error(`pm2-replace: ${error.message}`);
    process.exitCode = 1;
  }
}
