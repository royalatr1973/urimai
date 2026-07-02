import { describe, it, expect } from "vitest";
import { evaluate } from "../src/index.js";
import { profile, scheme, IN_OP, EXTENDED } from "./fixtures.js";

/**
 * Tests for the curator verification pass: the new `in` operator and the extended
 * Profile fields (asset cap, destitution flag, split land, KMUT disqualifiers).
 *
 * Discipline (per Phase 1): these test the MECHANISM against the engine's own
 * fixtures, not the real (DB-seeded) scheme data.
 */

describe('operator "in"', () => {
  it("passes when the field value is a member of the set", () => {
    expect(evaluate(profile({ gender: "female" }), IN_OP).status).toBe("eligible");
    expect(evaluate(profile({ gender: "other" }), IN_OP).status).toBe("eligible");
  });

  it("fails when the field value is outside the set", () => {
    const v = evaluate(profile({ gender: "male" }), IN_OP);
    expect(v.status).toBe("not_eligible");
    expect(v.reasons).toContain("Woman or transgender applicant");
  });

  it("is need_info when the set field is unknown", () => {
    const v = evaluate(profile({ gender: null }), IN_OP);
    expect(v.status).toBe("need_info");
    expect(v.missingFields).toEqual(["gender"]);
  });

  it("throws when an 'in' rule's value is not an array", () => {
    const bad = scheme({
      id: "bad_in",
      criteria: [{ field: "gender", op: "in", value: "female", label: "bad in rule" }],
    });
    expect(() => evaluate(profile({ gender: "female" }), bad)).toThrow(/Malformed rule: op "in"/);
  });

  it("does not throw for a malformed 'in' rule when the field is unknown", () => {
    const bad = scheme({
      id: "bad_in2",
      criteria: [{ field: "gender", op: "in", value: "female", label: "bad in rule" }],
    });
    expect(evaluate(profile({ gender: null }), bad).status).toBe("need_info");
  });
});

describe("extended Profile fields", () => {
  // A profile that fully satisfies EXTENDED.
  const eligible = () =>
    profile({
      has_regular_income: false, // destitute
      fixed_assets_value: 40000,
      annual_family_income: 100000,
      land_acres_wet: 1,
      land_acres_dry: 2,
      annual_electricity_units: 1200,
      professional_tax_payer: false,
      is_pensioner: false,
      psu_or_bank_employee: false,
      elected_representative: false,
    });

  it("a fully-qualifying extended profile is eligible", () => {
    expect(evaluate(eligible(), EXTENDED).status).toBe("eligible");
  });

  it("destitution criterion: false passes, true fails, null asks", () => {
    expect(evaluate(eligible(), EXTENDED).status).toBe("eligible"); // has_regular_income false
    const notDestitute = evaluate({ ...eligible(), has_regular_income: true }, EXTENDED);
    expect(notDestitute.status).toBe("not_eligible");
    expect(notDestitute.reasons).toContain("Destitute — no regular income (assessed at application)");
    const unknown = evaluate({ ...eligible(), has_regular_income: null }, EXTENDED);
    expect(unknown.status).toBe("need_info");
    expect(unknown.missingFields).toContain("has_regular_income");
  });

  it("fixed-assets cap is inclusive at the boundary", () => {
    expect(evaluate({ ...eligible(), fixed_assets_value: 50000 }, EXTENDED).status).toBe("eligible");
    expect(evaluate({ ...eligible(), fixed_assets_value: 50001 }, EXTENDED).status).toBe("not_eligible");
  });

  it("annual family income uses strict lt", () => {
    expect(evaluate({ ...eligible(), annual_family_income: 249999 }, EXTENDED).status).toBe("eligible");
    expect(evaluate({ ...eligible(), annual_family_income: 250000 }, EXTENDED).status).toBe("not_eligible");
  });

  it.each([
    ["land_acres_wet", 6],
    ["land_acres_dry", 11],
    ["annual_electricity_units", 3600],
  ] as const)("numeric exclusion %s=%d disqualifies", (field, val) => {
    const v = evaluate({ ...eligible(), [field]: val }, EXTENDED);
    expect(v.status).toBe("not_eligible");
  });

  it.each([
    "professional_tax_payer",
    "is_pensioner",
    "psu_or_bank_employee",
    "elected_representative",
  ] as const)("boolean exclusion %s=true disqualifies", (field) => {
    const v = evaluate({ ...eligible(), [field]: true }, EXTENDED);
    expect(v.status).toBe("not_eligible");
  });

  it("electricity exclusion is at-or-above (gte) the cap", () => {
    expect(evaluate({ ...eligible(), annual_electricity_units: 3599 }, EXTENDED).status).toBe("eligible");
    expect(evaluate({ ...eligible(), annual_electricity_units: 3600 }, EXTENDED).status).toBe("not_eligible");
  });
});
