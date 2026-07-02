import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { parseInbound, verifyChallenge, verifySignature } from "../src/whatsapp.js";

describe("verifyChallenge", () => {
  it("echoes the challenge when mode + token match", () => {
    const q = { "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "12345" };
    expect(verifyChallenge(q, "tok")).toBe("12345");
  });
  it("rejects a wrong token", () => {
    const q = { "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "12345" };
    expect(verifyChallenge(q, "tok")).toBeNull();
  });
});

describe("verifySignature", () => {
  const secret = "app-secret";
  const body = JSON.stringify({ hello: "world" });
  const good = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a correct signature", () => {
    expect(verifySignature(secret, body, good)).toBe(true);
  });
  it("rejects a tampered body", () => {
    expect(verifySignature(secret, body + "x", good)).toBe(false);
  });
  it("rejects a missing/garbage header", () => {
    expect(verifySignature(secret, body, undefined)).toBe(false);
    expect(verifySignature(secret, body, "sha256=deadbeef")).toBe(false);
  });
});

describe("parseInbound", () => {
  const wrap = (message: unknown) => ({ entry: [{ changes: [{ value: { messages: [message] } }] }] });

  it("normalizes a text message", () => {
    const m = parseInbound(wrap({ from: "9199", type: "text", text: { body: "வணக்கம்" } }));
    expect(m).toEqual({ from: "9199", kind: "text", text: "வணக்கம்" });
  });
  it("normalizes a voice/audio message to a mediaId", () => {
    const m = parseInbound(wrap({ from: "9199", type: "audio", audio: { id: "MEDIA1" } }));
    expect(m).toEqual({ from: "9199", kind: "audio", mediaId: "MEDIA1" });
  });
  it("returns null for non-message events (e.g. status callbacks)", () => {
    expect(parseInbound({ entry: [{ changes: [{ value: { statuses: [{ id: "x" }] } }] }] })).toBeNull();
    expect(parseInbound({})).toBeNull();
  });
});
