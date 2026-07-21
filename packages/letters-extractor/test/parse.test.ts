import { describe, it, expect } from "vitest";
import { parseClassification, parseLetterFacts, sanitizeLetterFacts } from "../src/schema.js";

const IDS = ["rti_request", "police_complaint", "generic_petition"];
const FB = "generic_petition";

describe("parseClassification — malformed output never crashes", () => {
  it("parses a clean reply", () => {
    const r = parseClassification('{"letterTypeId":"police_complaint","language":"ta"}', IDS, FB);
    expect(r).toEqual({ letterTypeId: "police_complaint", categoryId: null, language: "ta" });
  });

  it("keeps a categoryId only when it is in the provided category list", () => {
    const cats = ["patta_transfer", "pds_short_supply"];
    const good = parseClassification(
      '{"letterTypeId":"police_complaint","categoryId":"pds_short_supply","language":null}',
      IDS,
      FB,
      cats,
    );
    expect(good.categoryId).toBe("pds_short_supply");
    const invented = parseClassification(
      '{"letterTypeId":"police_complaint","categoryId":"moon_land_grab","language":null}',
      IDS,
      FB,
      cats,
    );
    expect(invented.categoryId).toBeNull(); // hallucinated category never routes a letter
  });

  it("strips code fences and surrounding prose", () => {
    const r = parseClassification('Sure!\n```json\n{"letterTypeId":"rti_request","language":null}\n```', IDS, FB);
    expect(r.letterTypeId).toBe("rti_request");
  });

  it("a hallucinated id falls back to the generic petition", () => {
    expect(parseClassification('{"letterTypeId":"love_letter","language":null}', IDS, FB).letterTypeId).toBe(FB);
  });

  it("junk, empty, and non-object replies fall back", () => {
    for (const raw of ["", "no json here", "[1,2,3]", '"a string"', "{broken", "null"]) {
      const r = parseClassification(raw, IDS, FB);
      expect(r).toEqual({ letterTypeId: FB, categoryId: null, language: null });
    }
  });

  it("an invalid language becomes null without losing the type", () => {
    const r = parseClassification('{"letterTypeId":"rti_request","language":"french"}', IDS, FB);
    expect(r).toEqual({ letterTypeId: "rti_request", categoryId: null, language: null });
  });
});

describe("parseLetterFacts — malformed output never crashes", () => {
  it("keeps known keys with non-empty string values, trimmed", () => {
    const f = parseLetterFacts('{"sender_name":"  க. சாந்தி ","incident_place":"சேலம்"}');
    expect(f.sender_name).toBe("க. சாந்தி");
    expect(f.incident_place).toBe("சேலம்");
  });

  it("drops unknown keys, empty strings, and non-string values", () => {
    const f = parseLetterFacts(
      '{"sender_name":"","amount":8000,"letterTypeId":"rti_request","verdict":"eligible","subject":"   "}',
    );
    expect(f).toEqual({ letterTypeId: null, language: null });
  });

  it("junk and non-object replies yield empty facts", () => {
    for (const raw of ["", "sorry, I cannot", "[]", "{nope", "42"]) {
      expect(parseLetterFacts(raw)).toEqual({ letterTypeId: null, language: null });
    }
  });

  it("recovers a JSON object wrapped in prose", () => {
    const f = parseLetterFacts('Here are the facts: {"relief_sought":"விளக்குகளை சரி செய்ய வேண்டும்"} hope that helps');
    expect(f.relief_sought).toBe("விளக்குகளை சரி செய்ய வேண்டும்");
  });
});

describe("sanitizeLetterFacts — operator-edited input", () => {
  it("survives hostile shapes", () => {
    for (const input of [null, undefined, 42, "hi", [], () => {}]) {
      expect(sanitizeLetterFacts(input)).toEqual({ letterTypeId: null, language: null });
    }
  });
});
