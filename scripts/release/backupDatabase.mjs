import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseOptions, positiveInteger, resolveOutputPath } from "./lib.mjs";

function safeLabel(value, name) {
  const label = String(value || "").trim();
  if (!label || label.length > 200 || /[\r\n\0]/.test(label)) throw new Error(`${name} is required and must be 200 characters or fewer`);
  return label;
}

export function postgresEnvironment(rawUrl, baseEnvironment = process.env) {
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error("BACKUP_DATABASE_URL or DATABASE_URL must be an absolute PostgreSQL URL"); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
    throw new Error("Backup database URL must identify a PostgreSQL server and database");
  }
  const environment = { ...baseEnvironment };
  environment.PGHOST = decodeURIComponent(url.hostname);
  environment.PGPORT = url.port || "5432";
  environment.PGDATABASE = decodeURIComponent(url.pathname.slice(1));
  if (url.username) environment.PGUSER = decodeURIComponent(url.username);
  if (url.password) environment.PGPASSWORD = decodeURIComponent(url.password);
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode) environment.PGSSLMODE = sslMode;
  delete environment.DATABASE_URL;
  delete environment.BACKUP_DATABASE_URL;
  return environment;
}

function run(command, args, { environment, timeoutMs, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: environment,
      shell: false,
      windowsHide: true,
      stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, timeoutMs);
    timer.unref();
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (signal) reject(new Error(`${command} terminated by ${signal}`));
      else if (code !== 0) reject(new Error(`${command} exited ${code}${capture && stderr.trim() ? `: ${stderr.trim()}` : ""}`));
      else resolve({ stdout, stderr });
    });
  });
}

export async function createDatabaseBackup({
  databaseUrl,
  outputDirectory = "backups",
  environmentName,
  reason,
  timeoutMs = 300_000,
  dryRun = false,
  now = new Date()
}) {
  const environment = postgresEnvironment(databaseUrl);
  const deploymentEnvironment = safeLabel(environmentName, "--environment");
  const backupReason = safeLabel(reason, "--reason");
  const output = resolveOutputPath(outputDirectory, "backups");
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const baseName = `hawelly-db_${deploymentEnvironment.replace(/[^A-Za-z0-9_-]/g, "-")}_${timestamp}`;
  const finalPath = join(output, `${baseName}.dump`);
  const temporaryPath = `${finalPath}.partial`;
  const manifestPath = `${finalPath}.manifest.json`;
  if (dryRun) return { dryRun: true, finalPath, manifestPath };

  await mkdir(output, { recursive: true, mode: 0o700 });
  let published = false;
  try {
    await run("pg_dump", ["--format=custom", "--no-password", "--file", temporaryPath], { environment, timeoutMs });
    const metadata = await stat(temporaryPath);
    if (!metadata.isFile() || metadata.size < 1) throw new Error("pg_dump produced an empty backup");
    await chmod(temporaryPath, 0o600);
    await run("pg_restore", ["--list", temporaryPath], { environment, timeoutMs, capture: true });
    const digest = createHash("sha256").update(await readFile(temporaryPath)).digest("hex");
    const client = (await run("pg_dump", ["--version"], { environment, timeoutMs, capture: true })).stdout.trim();
    await copyFile(temporaryPath, finalPath, constants.COPYFILE_EXCL);
    published = true;
    await chmod(finalPath, 0o600);
    await rm(temporaryPath);
    const manifest = {
      formatVersion: 1,
      createdAt: now.toISOString(),
      environment: deploymentEnvironment,
      reason: backupReason,
      file: `${baseName}.dump`,
      bytes: metadata.size,
      sha256: digest,
      pgDumpVersion: client,
      verification: "pg_restore --list passed"
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    return { dryRun: false, finalPath, manifestPath, manifest };
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    if (published) await rm(finalPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function runBackup(argumentsList = process.argv.slice(2)) {
  const { options } = parseOptions(argumentsList);
  const databaseUrl = process.env.BACKUP_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || "";
  if (!databaseUrl) throw new Error("BACKUP_DATABASE_URL or DATABASE_URL is required");
  const result = await createDatabaseBackup({
    databaseUrl,
    outputDirectory: String(options.get("output-dir") || "backups"),
    environmentName: options.get("environment"),
    reason: options.get("reason"),
    timeoutMs: positiveInteger(options.get("timeout-ms"), 300_000, "timeout", 3_600_000),
    dryRun: options.has("dry-run")
  });
  if (result.dryRun) console.log(`Backup dry run passed; target would be ${result.finalPath}`);
  else console.log(`Backup verified: ${result.finalPath}\nManifest: ${result.manifestPath}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBackup().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`database-backup: ${error.message}`);
    process.exitCode = 1;
  });
}
