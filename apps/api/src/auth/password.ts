import { Algorithm, hash, verify, Version } from "@node-rs/argon2";

const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  version: Version.V0x13,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32
} as const;

let dummyHashPromise: Promise<string> | undefined;

export function hashPassword(password: string) {
  return hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(passwordHash: string, password: string) {
  return verify(passwordHash, password, ARGON2_OPTIONS);
}

export function verifyDummyPassword(password: string) {
  dummyHashPromise ??= hashPassword("hawelly-dummy-password-never-used");
  return dummyHashPromise.then((dummyHash) => verifyPassword(dummyHash, password));
}
