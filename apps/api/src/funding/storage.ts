import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, mkdir, open, stat, unlink } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { PublicApiError } from "../http/errors.js";

const OBJECT_KEY = /^transfers\/[0-9a-f-]{36}\/(funding\/[0-9a-f-]{36}\/proof|payout\/[0-9a-f-]{36}\/evidence)\.(pdf|jpg|png)$/;

export type EvidenceOperation = "upload" | "download";

export class EvidenceUrlSigner {
  constructor(private readonly secret: string) {}

  private signature(operation: EvidenceOperation, proofId: string, objectKey: string, expires: number) {
    return createHmac("sha256", this.secret)
      .update(`v1\n${operation}\n${proofId}\n${objectKey}\n${expires}`, "utf8")
      .digest("base64url");
  }

  sign(operation: EvidenceOperation, proofId: string, objectKey: string, expires: number) {
    return this.signature(operation, proofId, objectKey, expires);
  }

  verify(operation: EvidenceOperation, proofId: string, objectKey: string, expires: number, supplied: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(supplied)) return false;
    const expected = Buffer.from(this.signature(operation, proofId, objectKey, expires));
    const candidate = Buffer.from(supplied);
    return expected.length === candidate.length && timingSafeEqual(expected, candidate);
  }
}

export class LocalEvidenceStorage {
  private readonly rootPrefix: string;

  constructor(private readonly root: string, private readonly maximumBytes: number) {
    this.rootPrefix = `${resolve(root)}${sep}`;
  }

  private pathFor(objectKey: string) {
    if (!OBJECT_KEY.test(objectKey)) throw new PublicApiError(400, "INVALID_EVIDENCE_KEY", "Evidence object key is invalid");
    const target = resolve(this.root, ...objectKey.split("/"));
    if (!target.startsWith(this.rootPrefix)) throw new PublicApiError(400, "INVALID_EVIDENCE_KEY", "Evidence object key is invalid");
    return target;
  }

  async initialize() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") await chmod(this.root, 0o700);
  }

  async healthcheck() {
    await this.initialize();
    const target = resolve(this.root, `.health-${randomUUID()}`);
    const handle = await open(target, "wx", 0o600);
    try {
      await handle.writeFile("ok", "utf8");
    } finally {
      await handle.close();
      await unlink(target).catch(() => undefined);
    }
  }

  async writeObject(objectKey: string, source: AsyncIterable<Uint8Array>, expectedBytes: number, contentType: string) {
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > this.maximumBytes) {
      throw new PublicApiError(413, "EVIDENCE_TOO_LARGE", "Evidence file size is invalid");
    }
    const target = this.pathFor(objectKey);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const handle = await open(target, "wx", 0o600).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") throw new PublicApiError(409, "EVIDENCE_ALREADY_UPLOADED", "Evidence has already been uploaded");
      throw error;
    });
    let written = 0;
    const prefix = Buffer.alloc(8);
    let prefixLength = 0;
    try {
      for await (const chunk of source) {
        if (prefixLength < prefix.length) {
          const copyLength = Math.min(prefix.length - prefixLength, chunk.byteLength);
          Buffer.from(chunk.buffer, chunk.byteOffset, copyLength).copy(prefix, prefixLength);
          prefixLength += copyLength;
        }
        written += chunk.byteLength;
        if (written > expectedBytes || written > this.maximumBytes) {
          throw new PublicApiError(413, "EVIDENCE_TOO_LARGE", "Evidence file size does not match the upload request");
        }
        await handle.writeFile(chunk);
      }
      if (written !== expectedBytes) {
        throw new PublicApiError(400, "EVIDENCE_SIZE_MISMATCH", "Evidence file size does not match the upload request");
      }
      const validSignature =
        (contentType === "application/pdf" && prefix.subarray(0, 5).equals(Buffer.from("%PDF-"))) ||
        (contentType === "image/png" && prefix.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
        (contentType === "image/jpeg" && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff);
      if (!validSignature) {
        throw new PublicApiError(400, "EVIDENCE_SIGNATURE_MISMATCH", "Evidence content does not match its declared file type");
      }
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(target).catch(() => undefined);
      throw error;
    }
    await handle.close();
  }

  async deleteObject(objectKey: string) {
    await unlink(this.pathFor(objectKey)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  async openObject(objectKey: string) {
    const target = this.pathFor(objectKey);
    const metadata = await stat(target);
    if (!metadata.isFile()) throw new PublicApiError(404, "EVIDENCE_NOT_FOUND", "Evidence file was not found");
    return { stream: createReadStream(target), size: metadata.size };
  }
}
