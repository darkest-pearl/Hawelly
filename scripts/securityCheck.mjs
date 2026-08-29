import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const forbidden = [
  { name: "Supabase service role", pattern: /SUPABASE_SERVICE_ROLE(?:_KEY)?|service[_-]role[_-]key/i },
  { name: "database URL", pattern: /DATABASE_URL|postgres(?:ql)?:\/\//i },
  { name: "access signing secret", pattern: /AUTH_ACCESS_SECRET/i },
  { name: "rate-limit pepper", pattern: /AUTH_RATE_LIMIT_PEPPER/i },
  { name: "evidence signing secret", pattern: /EVIDENCE_SIGNING_SECRET/i },
  { name: "public secret environment variable", pattern: /NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|PRIVATE|SERVICE_ROLE|DATABASE)/i }
];

function trackedClientFiles() {
  const output = execFileSync(
    "git",
    [
      "-c",
      `safe.directory=${repositoryRoot.replaceAll("\\", "/")}`,
      "ls-files",
      "-z",
      "--",
      "apps/web",
      "apps/android-client"
    ],
    { cwd: repositoryRoot }
  );
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((path) => resolve(repositoryRoot, path));
}

function filesBelow(path) {
  if (!existsSync(path)) return [];
  const entries = readdirSync(path, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const child = resolve(path, entry.name);
    return entry.isDirectory() ? filesBelow(child) : [child];
  });
}

const generatedClientFiles = [
  ...filesBelow(resolve(repositoryRoot, "apps/web/.next/static")),
  ...filesBelow(resolve(repositoryRoot, "apps/web/.next/server/app")),
  ...filesBelow(resolve(repositoryRoot, "apps/android-client/app/build/outputs"))
];
const failures = [];
for (const path of [...trackedClientFiles(), ...generatedClientFiles]) {
  if (!existsSync(path) || statSync(path).size > 50 * 1024 * 1024) continue;
  const content = readFileSync(path).toString("latin1");
  for (const rule of forbidden) {
    if (rule.pattern.test(content)) {
      failures.push(`${rule.name}: ${path.slice(repositoryRoot.length + 1)}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Client security boundary check failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Client security boundary check passed (${trackedClientFiles().length} tracked files, ${generatedClientFiles.length} generated artifacts).`
  );
}
