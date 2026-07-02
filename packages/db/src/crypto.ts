/**
 * At-rest PII encryption (AES-256-GCM). Identity is collected ONLY at the apply stage and
 * stored encrypted (PROJECT_BRIEF.md §2.3, Phase 6). The key comes from PII_ENCRYPTION_KEY
 * (32 bytes, base64). GCM authenticates the ciphertext, so tampering fails to decrypt.
 *
 * Format: "<iv-b64>:<tag-b64>:<ciphertext-b64>".
 */
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";

export function getPiiKey(): Buffer {
  const b64 = process.env.PII_ENCRYPTION_KEY;
  if (!b64) throw new Error("PII_ENCRYPTION_KEY is not set (32-byte base64). Identity cannot be stored.");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error(`PII_ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}`);
  return key;
}

export function encryptString(plain: string, key: Buffer = getPiiKey()): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptString(blob: string, key: Buffer = getPiiKey()): string {
  const [ivB, tagB, dataB] = blob.split(":");
  if (!ivB || !tagB || !dataB) throw new Error("malformed ciphertext");
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
}

export const encryptJson = (obj: unknown, key?: Buffer): string => encryptString(JSON.stringify(obj), key);
export const decryptJson = <T>(blob: string, key?: Buffer): T => JSON.parse(decryptString(blob, key)) as T;
