import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(scriptDirectory, "..");
const entrypoint = path.join(appDirectory, "dist", "src", "index.js");

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a local port"));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

async function waitForHealth(url: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      const body = await response.json();
      if (response.ok && body.ok === true && body.service === "hawelly-api") {
        return;
      }
      lastError = new Error(`Unexpected response: ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw lastError instanceof Error ? lastError : new Error("Healthcheck timed out");
}

async function main() {
  const port = await reservePort();
  const child = spawn(process.execPath, [entrypoint], {
    cwd: appDirectory,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "test",
      AUTH_ACCESS_SECRET:
        process.env.AUTH_ACCESS_SECRET || "smoke-only-access-secret-at-least-32-characters",
      AUTH_RATE_LIMIT_PEPPER:
        process.env.AUTH_RATE_LIMIT_PEPPER ||
        "smoke-only-rate-pepper-distinct-at-least-32-characters"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  try {
    await waitForHealth(`http://127.0.0.1:${port}/health`);
    console.log(`Built API health smoke passed on port ${port}`);
  } finally {
    child.kill();
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once("exit", () => resolve());
    });
  }

  if (stderr.trim()) {
    throw new Error(`API wrote to stderr during smoke test: ${stderr.trim()}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
