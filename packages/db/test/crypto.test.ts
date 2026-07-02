import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { encryptJson, decryptJson, encryptString, decryptString, type Keyring } from "../src/crypto.js";

const key = (id = "k1"): Keyring => ({ activeId: id, keys: new Map([[id, crypto.randomBytes(32)]]) });

describe("PII encryption (AES-256-GCM, key-versioned)", () => {
  it("round-trips a JSON PII payload", () => {
    const kr = key();
    const pii = { name: "ஜெயலட்சுமி", aadhaar: "1234-5678-9012", phone: "9199999999" };
    expect(decryptJson(encryptJson(pii, kr), kr)).toEqual(pii);
  });

  it("ciphertext carries the key id and not the plaintext", () => {
    const kr = key("k1");
    const blob = encryptString("Jayalakshmi 1234-5678-9012", kr);
    expect(blob.startsWith("k1:")).toBe(true);
    expect(blob).not.toContain("Jayalakshmi");
    expect(blob).not.toContain("1234-5678-9012");
  });

  it("rejects tampered ciphertext (GCM auth tag)", () => {
    const kr = key();
    const blob = encryptString("secret", kr);
    const [id, iv, tag, data] = blob.split(":");
    const flipped = data!.slice(0, -2) + (data!.endsWith("A") ? "B" : "A") + data!.slice(-1);
    expect(() => decryptString([id, iv, tag, flipped].join(":"), kr)).toThrow();
  });

  it("fails with the wrong key material", () => {
    const blob = encryptString("secret", key());
    expect(() => decryptString(blob, key())).toThrow(); // fresh keyring, same id, different bytes
  });

  describe("key rotation", () => {
    it("old blobs decrypt via their retired key; new blobs use the new active key", () => {
      const k1 = crypto.randomBytes(32);
      const k2 = crypto.randomBytes(32);

      const before: Keyring = { activeId: "k1", keys: new Map([["k1", k1]]) };
      const oldBlob = encryptString("old record", before);

      // Rotate: k2 becomes active, k1 is retired but kept for decryption.
      const after: Keyring = { activeId: "k2", keys: new Map([["k2", k2], ["k1", k1]]) };

      expect(decryptString(oldBlob, after)).toBe("old record"); // no data loss
      expect(encryptString("new record", after).startsWith("k2:")).toBe(true);
    });

    it("names the missing key id when a retired key was dropped", () => {
      const oldBlob = encryptString("x", key("k1"));
      const withoutK1: Keyring = { activeId: "k2", keys: new Map([["k2", crypto.randomBytes(32)]]) };
      expect(() => decryptString(oldBlob, withoutK1)).toThrow(/no key "k1"/);
    });

    it("legacy 3-part blobs (pre-versioning) decrypt with the active key", () => {
      // Simulate a legacy blob: strip the key-id prefix off a modern one.
      const kr = key();
      const legacy = encryptString("legacy record", kr).split(":").slice(1).join(":");
      expect(legacy.split(":").length).toBe(3);
      expect(decryptString(legacy, kr)).toBe("legacy record");
    });
  });
});
