import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { auditReleaseEnvironment } from "./releaseAudit.mjs";
import { checkHealth } from "./healthCheck.mjs";
import { loadEnvFiles, parseEnvText, secretSummary } from "./lib.mjs";
import { parseWithEnvArguments } from "./withEnv.mjs";
import { postgresEnvironment } from "./backupDatabase.mjs";
import { summarizePm2Environment } from "./pm2EnvInspect.mjs";

test("dotenv parsing preserves quoted spaces without interpolation", () => {
  assert.deepEqual(parseEnvText('ALPHA="hello world"\nBETA=plain # comment\nGAMMA=\'${ALPHA}\'\n'), {
    ALPHA: "hello world",
    BETA: "plain",
    GAMMA: "${ALPHA}"
  });
});

test("later environment files override earlier files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hawelly-env-"));
  try {
    const first = join(directory, "first.env");
    const second = join(directory, "second.env");
    await writeFile(first, "VALUE=first\nUNCHANGED=yes\n");
    await writeFile(second, "VALUE=second\n");
    const environment = await loadEnvFiles([first, second], {});
    assert.deepEqual(environment, { VALUE: "second", UNCHANGED: "yes" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("with-env requires an explicit command separator", () => {
  assert.throws(() => parseWithEnvArguments(["node", "script.js"]), /Usage/);
  assert.deepEqual(parseWithEnvArguments(["--env", "one.env", "--", "node", "script.js"]).files, ["one.env"]);
});

test("with-env passes the final file values to a child without printing secrets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hawelly-with-env-"));
  try {
    const first = join(directory, "first.env");
    const second = join(directory, "second.env");
    const secret = "do-not-print-this-secret";
    await writeFile(first, `ROTATION_MARKER=before\nPRIVATE_VALUE=${secret}\n`);
    await writeFile(second, "ROTATION_MARKER=after\n");
    const output = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        "scripts/release/withEnv.mjs", "--env", first, "--env", second, "--",
        process.execPath, "-e", "process.stdout.write(process.env.ROTATION_MARKER || '')"
      ], { cwd: process.cwd(), shell: false, windowsHide: true });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`with-env exited ${code}: ${stderr}`)));
    });
    assert.equal(output.stdout, "after");
    assert.equal(`${output.stdout}${output.stderr}`.includes(secret), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("release audit accepts a production configuration and rejects secret reuse", () => {
  const api = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://hawelly:private@db.internal/hawelly",
    AUTH_ACCESS_SECRET: "a".repeat(32),
    AUTH_RATE_LIMIT_PEPPER: "b".repeat(32),
    EVIDENCE_SIGNING_SECRET: "c".repeat(32),
    EVIDENCE_PUBLIC_BASE_URL: "https://api.example.com",
    EVIDENCE_STORAGE_ROOT: process.platform === "win32" ? "C:\\hawelly-evidence" : "/srv/hawelly-evidence",
    CORS_ORIGINS: "https://app.example.com",
    TRUSTED_BFF_ADDRESSES: "127.0.0.1,::1"
  };
  const web = {
    NODE_ENV: "production",
    HAWELLY_API_URL: "https://api.example.com",
    HAWELLY_WEB_ORIGIN: "https://app.example.com",
    HAWELLY_CLIENT_IP_HEADER: "x-real-ip"
  };
  assert.deepEqual(auditReleaseEnvironment(api, web), []);
  assert.match(auditReleaseEnvironment({ ...api, EVIDENCE_SIGNING_SECRET: api.AUTH_ACCESS_SECRET }, web).join(" "), /distinct/);
});

test("health check validates all public operational probes", async () => {
  const calls = [];
  const results = await checkHealth("https://api.example.com", {
    fetchImplementation: async (url) => {
      calls.push(url.pathname);
      const detail = url.pathname.endsWith("ready") ? { readiness: "ready" } : url.pathname.endsWith("storage") ? { storage: "ready" } : {};
      return new Response(JSON.stringify({ ok: true, service: "hawelly-api", ...detail }), { status: 200 });
    }
  });
  assert.deepEqual(calls, ["/health", "/health/ready", "/health/storage"]);
  assert.equal(results.length, 3);
});

test("database URL becomes libpq environment without retaining URLs", () => {
  const environment = postgresEnvironment("postgresql://user:p%40ss@db.example.com:5433/hawelly?sslmode=require", { DATABASE_URL: "remove", OTHER: "keep" });
  assert.equal(environment.PGHOST, "db.example.com");
  assert.equal(environment.PGPASSWORD, "p@ss");
  assert.equal(environment.PGDATABASE, "hawelly");
  assert.equal(environment.PGSSLMODE, "require");
  assert.equal(environment.DATABASE_URL, undefined);
});

test("PM2 inspection redacts secret values", () => {
  const secret = "very-private-value";
  const summary = summarizePm2Environment({ NODE_ENV: "production", AUTH_ACCESS_SECRET: secret });
  assert.equal(summary.NODE_ENV, "production");
  assert.match(summary.AUTH_ACCESS_SECRET, /^present bytes=/);
  assert.equal(JSON.stringify(summary).includes(secret), false);
  assert.match(secretSummary(secret), /fingerprint=/);
});
