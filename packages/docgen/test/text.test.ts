import { describe, it, expect } from "vitest";
import { assembleLetterText, draftHash, letterLabels } from "../src/text.js";
import { GOLDEN_DRAFT } from "./fixtures.js";

describe("assembleLetterText — the one canonical text", () => {
  it("lays the blocks out in the fixed TN formal-letter order", () => {
    const text = assembleLetterText(GOLDEN_DRAFT);
    const order = [
      "அனுப்புநர்:",
      "க. மாதிரி",
      "பெறுநர்:",
      "ஆணையர்,",
      "நாள்: 19-07-2026",
      "பொருள்: எங்கள் தெருவில்",
      "ஐயா / அம்மையீர்,",
      "எங்கள் தெருவில் உள்ள ஐந்து",
      "இது குறித்து 01-07-2026",
      "நன்றி.",
      "இப்படிக்கு,",
    ];
    let last = -1;
    for (const marker of order) {
      const at = text.indexOf(marker);
      expect(at, `"${marker}" missing or out of order`).toBeGreaterThan(last);
      last = at;
    }
  });

  it("uses English labels for en and dual labels for bilingual", () => {
    expect(assembleLetterText({ ...GOLDEN_DRAFT, language: "en" })).toContain("Subject:");
    expect(letterLabels("bilingual").subject).toBe("பொருள் / Subject:");
  });
});

describe("draftHash — what the approval record signs", () => {
  it("is stable for identical drafts", () => {
    expect(draftHash(GOLDEN_DRAFT)).toBe(draftHash({ ...GOLDEN_DRAFT }));
    expect(draftHash(GOLDEN_DRAFT)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when ANY user-visible content changes", () => {
    const base = draftHash(GOLDEN_DRAFT);
    expect(draftHash({ ...GOLDEN_DRAFT, subject: GOLDEN_DRAFT.subject + "!" })).not.toBe(base);
    expect(draftHash({ ...GOLDEN_DRAFT, bodyParagraphs: [GOLDEN_DRAFT.bodyParagraphs[0]!] })).not.toBe(base);
    expect(draftHash({ ...GOLDEN_DRAFT, date: "20-07-2026" })).not.toBe(base);
  });
});
