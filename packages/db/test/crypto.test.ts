import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { encryptJson, decryptJson, encryptString, decryptString } from "../src/crypto.js";

const key = crypto.randomBytes(32);

describe("PII encryption (AES-256-GCM)", () => {
  it("round-trips a JSON PII payload", () => {
    const pii = { name: "ஜெயலட்சுமி", aadhaar: "1234-5678-9012", phone: "9199999999" };
    const blob = encryptJson(pii, key);
    expect(decryptJson(blob, key)).toEqual(pii);
  });

  it("ciphertext does not contain the plaintext (encrypted at rest)", () => {
    const blob = encryptString("Jayalakshmi 1234-5678-9012", key);
    expect(blob).not.toContain("Jayalakshmi");
    expect(blob).not.toContain("1234-5678-9012");
  });

  it("rejects tampered ciphertext (GCM auth tag)", () => {
    const blob = encryptString("secret", key);
    const [iv, tag, data] = blob.split(":");
    const flipped = data.slice(0, -2) + (data.endsWith("A") ? "B" : "A") + data.slice(-1);
    expect(() => decryptString([iv, tag, flipped].join(":"), key)).toThrow();
  });

  it("fails with the wrong key", () => {
    const blob = encryptString("secret", key);
    expect(() => decryptString(blob, crypto.randomBytes(32))).toThrow();
  });
});
