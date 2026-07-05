import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT, buildUserPrompt } from "../src/prompt.js";

/**
 * The prompt is the accuracy lever. These guard that the critical rules — the ones a
 * naive extractor slips on — are actually encoded in the system prompt.
 */
describe("SYSTEM_PROMPT encodes the critical rules", () => {
  it("states the null-over-guess golden rule", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("null over guess");
  });

  it("never lets the LLM decide eligibility", () => {
    expect(SYSTEM_PROMPT).toMatch(/never decide eligibility/i);
  });

  it("distinguishes steady income from irregular work for has_regular_income", () => {
    expect(SYSTEM_PROMPT).toContain("has_regular_income");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("daily-wage");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("steady source");
  });

  it("separates individual monthly income from family annual income", () => {
    expect(SYSTEM_PROMPT).toContain("annual_family_income");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("never multiply");
  });

  it("encodes the Tamil wet/dry land distinction", () => {
    expect(SYSTEM_PROMPT).toContain("நஞ்சை");
    expect(SYSTEM_PROMPT).toContain("புஞ்சை");
    expect(SYSTEM_PROMPT).toContain("land_acres_wet");
    expect(SYSTEM_PROMPT).toContain("land_acres_dry");
  });

  it("derives residency from state, not from the model", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("derives it from state");
  });

  it("demands a bare JSON object with no fences/prose", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("only a single json object");
  });
});

describe("buildUserPrompt", () => {
  it("embeds the person's words verbatim", () => {
    const out = buildUserPrompt("எனக்கு வயசு 67");
    expect(out).toContain("எனக்கு வயசு 67");
  });

  it("without pendingField, includes no context hint", () => {
    const out = buildUserPrompt("no");
    expect(out.toLowerCase()).not.toContain("previous turn");
  });

  it("with pendingField, injects the field's context so bare answers land", () => {
    const out = buildUserPrompt("no", "disability_percent");
    expect(out.toLowerCase()).toContain("previous turn");
    expect(out).toContain("disability_percent");
    expect(out.toLowerCase()).toContain("bare"); // instruction to treat bare answers specially
  });

  it("unknown pendingField values are ignored (no crash, no bogus context)", () => {
    const out = buildUserPrompt("no", "nonsense_field");
    expect(out.toLowerCase()).not.toContain("previous turn");
  });
});

describe("SYSTEM_PROMPT — disability nuance", () => {
  it('treats a clear "no disability" statement as 0, not null', () => {
    // The old prompt only extracted a percentage; a bare "no disability" was left as null,
    // which caused the WhatsApp loop to re-ask the same question forever.
    expect(SYSTEM_PROMPT).toMatch(/no disability|not disabled|மாற்றுத்திறன் இல்லை/);
    expect(SYSTEM_PROMPT).toMatch(/→\s*0\b/); // must map that case to 0
  });
});
