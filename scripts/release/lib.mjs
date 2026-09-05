import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

function decodeDoubleQuoted(value, source, lineNumber) {
  let decoded = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== "\\") {
      decoded += character;
      continue;
    }
    index += 1;
    if (index >= value.length) throw new Error(`${source}:${lineNumber}: trailing escape`);
    const escaped = value[index];
    decoded += escaped === "n" ? "\n" : escaped === "r" ? "\r" : escaped === "t" ? "\t" : escaped;
  }
  return decoded;
}

function parseValue(rawValue, source, lineNumber) {
  const value = rawValue.trim();
  if (!value) return "";
  if (value.startsWith("\"") || value.startsWith("'")) {
    const quote = value[0];
    if (!value.endsWith(quote) || value.length < 2) {
      throw new Error(`${source}:${lineNumber}: unterminated quoted value`);
    }
    const inner = value.slice(1, -1);
    return quote === "\"" ? decodeDoubleQuoted(inner, source, lineNumber) : inner;
  }
  return value.replace(/\s+#.*$/, "").trimEnd();
}

export function parseEnvText(text, source = "environment") {
  const environment = {};
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const declaration = trimmed.startsWith("export ") ? trimmed.slice(7).trimStart() : trimmed;
    const equals = declaration.indexOf("=");
    if (equals < 1) throw new Error(`${source}:${index + 1}: expected KEY=value`);
    const key = declaration.slice(0, equals).trim();
    if (!ENV_KEY.test(key)) throw new Error(`${source}:${index + 1}: invalid environment key`);
    environment[key] = parseValue(declaration.slice(equals + 1), source, index + 1);
  }
  return environment;
}

export async function loadEnvFiles(files, baseEnvironment = process.env) {
  const environment = { ...baseEnvironment };
  for (const file of files) {
    const absolutePath = resolve(file);
    const contents = await readFile(absolutePath, "utf8");
    Object.assign(environment, parseEnvText(contents, absolutePath));
  }
  return environment;
}

export function exactOrigin(value, name, { https = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an exact HTTP(S) origin`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || (https && url.protocol !== 'https:') || url.username || url.password || url.origin !== value) {
    throw new Error(`${name} must be an exact${https ? " HTTPS" : " HTTP(S)"} origin`);
  }
  return url.origin;
}

export function requireStrongSecret(environment, name) {
  const value = environment[name]?.trim() || "";
  if (Buffer.byteLength(value, "utf8") < 32) throw new Error(`${name} must contain at least 32 bytes`);
  if (/replace|change-me|example|placeholder|local-only/i.test(value)) throw new Error(`${name} must not use an example placeholder`);
  return value;
}

export function secretSummary(value) {
  const bytes = Buffer.byteLength(value || "", "utf8");
  const fingerprint = createHash("sha256").update(value || "").digest("hex").slice(0, 12);
  return value ? `present bytes=${bytes} fingerprint=${fingerprint}` : "missing";
}

export function resolveOutputPath(value, defaultPath) {
  const target = value || defaultPath;
  return isAbsolute(target) ? target : resolve(target);
}

export function parseOptions(argumentsList) {
  const options = new Map();
  const positional = [];
  for (let index = 0; index < argumentsList.length; index += 1) {
    const item = argumentsList[index];
    if (!item.startsWith("--")) {
      positional.push(item);
      continue;
    }
    const equals = item.indexOf("=");
    if (equals > 2) {
      options.set(item.slice(2, equals), item.slice(equals + 1));
      continue;
    }
    const next = argumentsList[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      options.set(item.slice(2), next);
      index += 1;
    } else {
      options.set(item.slice(2), true);
    }
  }
  return { options, positional };
}

export function positiveInteger(value, fallback, name, maximum = 3_600_000) {
  const candidate = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return candidate;
}
