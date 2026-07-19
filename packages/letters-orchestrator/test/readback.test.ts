import { describe, it, expect } from "vitest";
import type { LetterDraft } from "@urimai/types";
import { chunkReadback, TTS_CHUNK_LIMIT } from "../src/readback.js";

const draft = (bodyParagraphs: string[]): LetterDraft => ({
  letterTypeId: "civic_grievance",
  typeVersion: 1,
  senderBlock: "லட்சுமி\nகாமராஜர் தெரு, திண்டுக்கல்",
  date: "19-07-2026",
  addresseeBlock: "ஆணையர், திண்டுக்கல் நகராட்சி",
  subject: "சாக்கடை பழுது",
  salutation: "ஐயா / அம்மையீர்,",
  bodyParagraphs,
  closing: "நன்றி.",
  signatureLine: "இப்படிக்கு,\nலட்சுமி",
  language: "ta",
});

describe("chunkReadback — TTS-safe blocks (§7.6)", () => {
  it("keeps a short letter to one chunk, under the limit", () => {
    const chunks = chunkReadback(draft(["சாக்கடை மூணு வாரமா ஓவர்ஃப்ளோ ஆகுது."]));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.length).toBeLessThanOrEqual(TTS_CHUNK_LIMIT);
  });

  it("splits a long letter on block boundaries, every chunk under the limit, nothing lost", () => {
    const para = "இந்த வரி மிக நீளமான புகார் விவரம். ".repeat(60); // ~2000 chars each
    const d = draft([para.trim(), para.trim()]);
    const chunks = chunkReadback(d);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(TTS_CHUNK_LIMIT);
    const all = chunks.join("\n\n");
    // Every user-visible piece of the letter is spoken somewhere.
    for (const s of [d.senderBlock.split("\n")[0]!, d.subject, d.salutation, d.closing, "இப்படிக்கு,"]) {
      expect(all).toContain(s);
    }
    // Body content survives chunking (possibly split, so sample a sentence).
    expect(all).toContain("இந்த வரி மிக நீளமான புகார் விவரம்.");
  });
});
