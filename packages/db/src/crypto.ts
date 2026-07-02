/**
 * At-rest PII encryption (AES-256-GCM) with KEY VERSIONING. Identity is collected ONLY at
 * the apply stage and stored encrypted (PROJECT_BRIEF.md §2.3, Phase 6).
 *
 * Every ciphertext is prefixed with the id of the key that produced it:
 *
 *   "<keyId>:<iv-b64>:<tag-b64>:<ciphertext-b64>"
 *
 * so keys can be ROTATED without losing data: new writes use the active key; old records
 * decrypt with the retired key their prefix names. (Legacy 3-part blobs from before
 * versioning decrypt with the active key.)
 *
 * Env:
 *   PII_ENCRYPTION_KEY   active key material (32 bytes, base64)   — required
 *   PII_ACTIVE_KEY_ID    id recorded on new ciphertexts           — default "k1"
 *   PII_RETIRED_KEYS     old keys kept for decryption, format "id=base64,id=base64"
 *
 * GCM authenticates the ciphertext, so tampering fails to decrypt.
 */
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";

export interface Keyring {
  activeId: string;
  keys: Map<string, Buffer>;
}

function decodeKey(b64: string, label: string): Buffer {
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error(`${label} must decode to 32 bytes, got ${key.length}`);
  return key;
}

/** Build the keyring from env. Throws if the active key is missing — fail closed. */
export function getKeyring(): Keyring {
  const active = process.env.PII_ENCRYPTION_KEY;
  if (!active) throw new Error("PII_ENCRYPTION_KEY is not set (32-byte base64). Identity cannot be stored.");
  const activeId = process.env.PII_ACTIVE_KEY_ID || "k1";
  if (activeId.includes(":")) throw new Error("PII_ACTIVE_KEY_ID must not contain ':'");

  const keys = new Map<string, Buffer>();
  keys.set(activeId, decodeKey(active, "PII_ENCRYPTION_KEY"));

  const retired = process.env.PII_RETIRED_KEYS;
  if (retired) {
    for (const pair of retired.split(",")) {
      const eq = pair.indexOf("=");
      if (eq <= 0) throw new Error(`PII_RETIRED_KEYS entry "${pair}" is not id=base64`);
      const id = pair.slice(0, eq).trim();
      if (id.includes(":")) throw new Error(`retired key id "${id}" must not contain ':'`);
      keys.set(id, decodeKey(pair.slice(eq + 1).trim(), `PII_RETIRED_KEYS[${id}]`));
    }
  }
  return { activeId, keys };
}

/** Backwards-compatible accessor for the active key. */
export function getPiiKey(): Buffer {
  const kr = getKeyring();
  return kr.keys.get(kr.activeId)!;
}

export function encryptString(plain: string, keyring: Keyring = getKeyring()): string {
  const key = keyring.keys.get(keyring.activeId);
  if (!key) throw new Error(`active key "${keyring.activeId}" missing from keyring`);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [keyring.activeId, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptString(blob: string, keyring: Keyring = getKeyring()): string {
  const parts = blob.split(":");
  let keyId: string, ivB: string, tagB: string, dataB: string;

  if (parts.length === 4) {
    [keyId, ivB, tagB, dataB] = parts as [string, string, string, string];
  } else if (parts.length === 3) {
    // Legacy pre-versioning blob — written by the active key of its era.
    keyId = keyring.activeId;
    [ivB, tagB, dataB] = parts as [string, string, string];
  } else {
    throw new Error("malformed ciphertext");
  }

  const key = keyring.keys.get(keyId);
  if (!key) throw new Error(`no key "${keyId}" in keyring — was a retired key dropped from PII_RETIRED_KEYS?`);

  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
}

export const encryptJson = (obj: unknown, keyring?: Keyring): string => encryptString(JSON.stringify(obj), keyring);
export const decryptJson = <T>(blob: string, keyring?: Keyring): T => JSON.parse(decryptString(blob, keyring)) as T;
