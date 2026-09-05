import { spawn } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { loadEnvFiles, positiveInteger } from "./lib.mjs";

export function parseWithEnvArguments(argumentsList) {
  const separator = argumentsList.indexOf("--");
  if (separator < 0 || separator === argumentsList.length - 1) {
    throw new Error("Usage: withEnv [--env FILE] [--timeout-ms N] -- COMMAND [ARG ...]");
  }
  const files = [];
  let timeoutMs = 120_000;
  for (let index = 0; index < separator; index += 1) {
    const item = argumentsList[index];
    if (item === "--env" && argumentsList[index + 1]) {
      files.push(argumentsList[index + 1]);
      index += 1;
    } else if (item === "--timeout-ms" && argumentsList[index + 1]) {
      timeoutMs = positiveInteger(argumentsList[index + 1], timeoutMs, "timeout", 3_600_000);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${item}`);
    }
  }
  return { files, timeoutMs, command: argumentsList[separator + 1], args: argumentsList.slice(separator + 2) };
}

export async function runWithEnv(argumentsList = process.argv.slice(2)) {
  const { files, timeoutMs, command, args } = parseWithEnvArguments(argumentsList);
  const environment = await loadEnvFiles(files);
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: environment, shell: false, stdio: "inherit", windowsHide: true });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, timeoutMs);
    timer.unref();
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (signal) reject(new Error(`Command terminated by ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWithEnv().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`with-env: ${error.message}`);
    process.exitCode = 1;
  });
}
