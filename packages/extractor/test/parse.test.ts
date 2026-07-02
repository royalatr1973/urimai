import { describe, it, expect } from "vitest";
import { EMPTY_PROFILE } from "@urimai/types";
import { parseProfile, deriveIsTamilNadu } from "../src/schema.js";

describe("parseProfile — JSON extraction robustness", () => {
  it("parses a clean JSON object", () => {
    const p = parseProfile('{"age": 67, "gender": "female"}');
    expect(p.age).toBe(67);
    expect(p.gender).toBe("female");
  });

  it("extracts JSON wrapped in ```json fences", () => {
    const raw = "```json\n{\"age\": 70}\n```";
    expect(parseProfile(raw).age).toBe(70);
  });

  it("extracts JSON embedded in surrounding prose", () => {
    const raw = 'Here is the profile: {"age": 55, "govt_employee": true} — hope that helps!';
    const p = parseProfile(raw);
    expect(p.age).toBe(55);
    expect(p.govt_employee).toBe(true);
  });

  it("returns EMPTY_PROFILE on unparseable text (never throws)", () => {
    expect(parseProfile("I could not understand that.")).toEqual(EMPTY_PROFILE);
  });

  it("returns EMPTY_PROFILE on empty / whitespace input", () => {
    expect(parseProfile("")).toEqual(EMPTY_PROFILE);
    expect(parseProfile("   ")).toEqual(EMPTY_PROFILE);
  });

  it("returns EMPTY_PROFILE when JSON is an array, not an object", () => {
    expect(parseProfile("[1, 2, 3]")).toEqual(EMPTY_PROFILE);
  });
});

describe("parseProfile — field-level validation", () => {
  it("missing fields become null (partial object)", () => {
    const p = parseProfile('{"age": 60}');
    expect(p.age).toBe(60);
    expect(p.gender).toBeNull();
    expect(p.monthly_income).toBeNull();
    expect(p.has_regular_income).toBeNull();
  });

  it("ignores unknown keys", () => {
    const p = parseProfile('{"age": 60, "favourite_colour": "blue"}');
    expect(p.age).toBe(60);
    expect(p).not.toHaveProperty("favourite_colour");
  });

  it("one invalid field becomes null without discarding the rest", () => {
    const p = parseProfile('{"age": 60, "gender": "M"}'); // bad enum
    expect(p.age).toBe(60);
    expect(p.gender).toBeNull();
  });

  it("rejects out-of-range numbers", () => {
    expect(parseProfile('{"disability_percent": 250}').disability_percent).toBeNull();
    expect(parseProfile('{"disability_percent": 40}').disability_percent).toBe(40);
    expect(parseProfile('{"age": -3}').age).toBeNull();
  });

  it("coerces numeric strings like \"1,200\" and \"₹1200\"", () => {
    expect(parseProfile('{"monthly_income": "1,200"}').monthly_income).toBe(1200);
    expect(parseProfile('{"monthly_income": "₹1200"}').monthly_income).toBe(1200);
    expect(parseProfile('{"land_acres_wet": "0.5"}').land_acres_wet).toBe(0.5);
  });

  it("coerces boolean strings; rejects non-booleans", () => {
    expect(parseProfile('{"govt_employee": "true"}').govt_employee).toBe(true);
    expect(parseProfile('{"govt_employee": "false"}').govt_employee).toBe(false);
    expect(parseProfile('{"govt_employee": "maybe"}').govt_employee).toBeNull();
  });

  it("validates the marital_status enum", () => {
    expect(parseProfile('{"marital_status": "widowed"}').marital_status).toBe("widowed");
    expect(parseProfile('{"marital_status": "complicated"}').marital_status).toBeNull();
  });
});

describe("is_tamil_nadu derivation (never trusted from the model)", () => {
  it("derives true from a Tamil Nadu state string (EN and TA)", () => {
    expect(parseProfile('{"state": "Tamil Nadu"}').is_tamil_nadu).toBe(true);
    expect(parseProfile('{"state": "தமிழ்நாடு"}').is_tamil_nadu).toBe(true);
  });

  it("derives false for other states", () => {
    expect(parseProfile('{"state": "Kerala"}').is_tamil_nadu).toBe(false);
  });

  it("is null when state is unknown", () => {
    expect(parseProfile("{}").is_tamil_nadu).toBeNull();
  });

  it("overrides any model-provided is_tamil_nadu with the derived value", () => {
    // model wrongly claims TN while naming Kerala — derivation wins
    const p = parseProfile('{"state": "Kerala", "is_tamil_nadu": true}');
    expect(p.is_tamil_nadu).toBe(false);
  });

  it("deriveIsTamilNadu handles the direct cases", () => {
    expect(deriveIsTamilNadu("Tamil Nadu")).toBe(true);
    expect(deriveIsTamilNadu("TN")).toBe(true);
    expect(deriveIsTamilNadu("Karnataka")).toBe(false);
    expect(deriveIsTamilNadu(null)).toBeNull();
    expect(deriveIsTamilNadu("")).toBeNull();
  });
});
