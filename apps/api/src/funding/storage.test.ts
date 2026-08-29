import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { PublicApiError } from "../http/errors.js";
import { LocalEvidenceStorage } from "./storage.js";

describe("local evidence storage", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("keeps storage directories and evidence files private", async () => {
    const root = await mkdtemp(join(tmpdir(), "hawelly-evidence-"));
    roots.push(root);
    const storage = new LocalEvidenceStorage(root, 1_024);
    const objectKey =
      "transfers/00000000-0000-4000-8000-000000000001/funding/00000000-0000-4000-8000-000000000002/proof.pdf";
    const payload = Buffer.from("%PDF-1.7\nprivate evidence", "utf8");

    await storage.initialize();
    await storage.writeObject(
      objectKey,
      Readable.from([payload]),
      payload.byteLength,
      "application/pdf"
    );

    expect(await readFile(join(root, ...objectKey.split("/")))).toEqual(payload);
    if (process.platform !== "win32") {
      expect((await stat(root)).mode & 0o777).toBe(0o700);
      expect((await stat(join(root, ...objectKey.split("/")))).mode & 0o777).toBe(0o600);
    }
  });

  it("rejects object keys outside the deterministic private namespace", async () => {
    const root = await mkdtemp(join(tmpdir(), "hawelly-evidence-"));
    roots.push(root);
    const storage = new LocalEvidenceStorage(root, 1_024);

    await expect(storage.openObject("../public/receipt.pdf")).rejects.toBeInstanceOf(
      PublicApiError
    );
  });
});
