import { describe, it, expect } from "vitest";
import { SEED_LETTER_TYPES } from "@urimai/db";
import type { LetterFacts } from "@urimai/types";
import {
  GENERIC_PETITION_ID,
  hasAllRequiredFacts,
  missingRequiredFacts,
  resolveLanguage,
  resolveLetterType,
} from "../src/catalogue.js";

const emptyFacts = (): LetterFacts => ({ letterTypeId: null, language: null });

describe("seed catalogue sanity", () => {
  it("ships the 6 common types plus the generic fallback", () => {
    expect(SEED_LETTER_TYPES).toHaveLength(7);
    expect(SEED_LETTER_TYPES.map((t) => t.id)).toContain(GENERIC_PETITION_ID);
  });

  it("every type is unverified until a human signs off, and only cites brief-named refs", () => {
    for (const t of SEED_LETTER_TYPES) {
      expect(t.verified).toBe(false);
      // No invented citations: today only the RTI ref named in LETTERS_BRIEF.md exists.
      if (t.id !== "rti_request") expect(t.legalRefs).toHaveLength(0);
    }
  });

  it("required and optional facts never overlap", () => {
    for (const t of SEED_LETTER_TYPES) {
      const overlap = t.requiredFacts.filter((k) => t.optionalFacts.includes(k));
      expect(overlap, `${t.id} lists ${overlap.join(", ")} as both required and optional`).toHaveLength(0);
    }
  });

  it("the generic fallback demands only the bare minimum (name + story)", () => {
    const generic = SEED_LETTER_TYPES.find((t) => t.id === GENERIC_PETITION_ID)!;
    expect(generic.requiredFacts).toEqual(["sender_name", "incident_details"]);
  });
});

describe("resolveLetterType", () => {
  it("returns the requested type when it exists", () => {
    expect(resolveLetterType(SEED_LETTER_TYPES, "rti_request")?.id).toBe("rti_request");
  });

  it("falls back to generic_petition for unknown or unclassified input", () => {
    expect(resolveLetterType(SEED_LETTER_TYPES, "love_letter")?.id).toBe(GENERIC_PETITION_ID);
    expect(resolveLetterType(SEED_LETTER_TYPES, null)?.id).toBe(GENERIC_PETITION_ID);
  });

  it("returns null (loudly, not silently) when even the fallback is missing", () => {
    expect(resolveLetterType([], "rti_request")).toBeNull();
  });
});

describe("missingRequiredFacts — the gap loop's question source", () => {
  const police = SEED_LETTER_TYPES.find((t) => t.id === "police_complaint")!;

  it("lists every required fact for empty facts", () => {
    expect(missingRequiredFacts(police, emptyFacts())).toEqual(police.requiredFacts);
  });

  it("shrinks as facts arrive, in the type's declared order", () => {
    const facts: LetterFacts = {
      ...emptyFacts(),
      sender_name: "க. மாதிரி",
      incident_place: "மாதிரி தெரு",
    };
    expect(missingRequiredFacts(police, facts)).toEqual(["sender_address", "incident_date", "incident_details"]);
  });

  it("treats whitespace-only answers as still missing", () => {
    const facts: LetterFacts = { ...emptyFacts(), sender_name: "   " };
    expect(missingRequiredFacts(police, facts)).toContain("sender_name");
  });

  it("hasAllRequiredFacts flips true only when everything is present", () => {
    const facts: LetterFacts = {
      ...emptyFacts(),
      sender_name: "க. மாதிரி",
      sender_address: "எண் 1, மாதிரி தெரு",
      incident_date: "2026-07-01",
      incident_place: "மாதிரி சந்தை",
      incident_details: "என் கைப்பை திருடப்பட்டது",
    };
    expect(hasAllRequiredFacts(police, facts)).toBe(true);
  });
});

describe("resolveLanguage", () => {
  const rti = SEED_LETTER_TYPES.find((t) => t.id === "rti_request")!;

  it("uses the type default when the user expressed no preference", () => {
    expect(resolveLanguage(rti, emptyFacts())).toBe(rti.languageDefault);
  });

  it("the user's explicit choice wins over the type default", () => {
    expect(resolveLanguage(rti, { ...emptyFacts(), language: "en" })).toBe("en");
  });
});
