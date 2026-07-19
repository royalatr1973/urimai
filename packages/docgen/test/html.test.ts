import { describe, it, expect } from "vitest";
import { renderLetterHtml } from "../src/html.js";
import { GOLDEN_DRAFT } from "./fixtures.js";

describe("renderLetterHtml", () => {
  it("renders every block of the draft", () => {
    const html = renderLetterHtml(GOLDEN_DRAFT);
    for (const s of [
      "அனுப்புநர்:",
      "பெறுநர்:",
      "ஸ்ரீநிவாசன் தெரு",
      "நாள்:",
      GOLDEN_DRAFT.subject,
      GOLDEN_DRAFT.salutation,
      ...GOLDEN_DRAFT.bodyParagraphs,
      "நன்றி.",
      "இப்படிக்கு,",
    ]) {
      expect(html).toContain(s);
    }
  });

  it("embeds the font via @font-face only when a data URL is provided", () => {
    expect(renderLetterHtml(GOLDEN_DRAFT)).not.toContain("@font-face");
    const embedded = renderLetterHtml(GOLDEN_DRAFT, { fontDataUrl: "data:font/ttf;base64,AAAA" });
    expect(embedded).toContain("@font-face");
    expect(embedded).toContain("data:font/ttf;base64,AAAA");
  });

  it("escapes HTML in user-derived content — a draft can never inject markup", () => {
    const hostile = { ...GOLDEN_DRAFT, subject: '<script>alert("x")</script>' };
    const html = renderLetterHtml(hostile);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("is deterministic — same draft, same bytes", () => {
    expect(renderLetterHtml(GOLDEN_DRAFT)).toBe(renderLetterHtml(GOLDEN_DRAFT));
  });
});
