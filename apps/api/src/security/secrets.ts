export function validateStrongSecret(value: string, name: string) {
  if (Buffer.byteLength(value, "utf8") < 32) {
    throw new Error(`${name} must contain at least 32 bytes`);
  }
  if (/replace|change-me|example/i.test(value)) {
    throw new Error(`${name} must not use an example placeholder`);
  }
  return value;
}

export function readStrongSecret(environment: NodeJS.ProcessEnv, name: string) {
  return validateStrongSecret(environment[name]?.trim() || "", name);
}
