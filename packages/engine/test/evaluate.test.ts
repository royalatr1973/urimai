import { describe, it, expect } from "vitest";
import type { Profile } from "@urimai/types";
import { evaluate } from "../src/index.js";
import {
  profile,
  scheme,
  OLD_AGE,
  WIDOW,
  DISABILITY,
  OP_COVERAGE,
} from "./fixtures.js";

// A profile that fully satisfies OLD_AGE.
const eligibleOldAge = (): Profile =>
  profile({
    is_tamil_nadu: true,
    age: 70,
    monthly_income: 1000,
    income_tax_payer: false,
    govt_employee: false,
  });

describe("basic outcomes", () => {
  it("returns eligible when all criteria pass and no exclusion triggers", () => {
    const v = evaluate(eligibleOldAge(), OLD_AGE);
    expect(v.status).toBe("eligible");
    expect(v.missingFields).toEqual([]);
    // reasons are the passing criteria labels
    expect(v.reasons).toEqual([
      "Resident of Tamil Nadu",
      "Aged 60 or above",
      "Monthly income within the limit",
    ]);
  });

  it("returns not_eligible when a criterion is known-false", () => {
    const v = evaluate({ ...eligibleOldAge(), age: 45 }, OLD_AGE);
    expect(v.status).toBe("not_eligible");
    expect(v.reasons).toContain("Aged 60 or above");
    expect(v.missingFields).toEqual([]);
  });

  it("returns not_eligible when an exclusion is true", () => {
    const v = evaluate({ ...eligibleOldAge(), income_tax_payer: true }, OLD_AGE);
    expect(v.status).toBe("not_eligible");
    expect(v.reasons).toContain("Income-tax payers are not eligible");
    expect(v.missingFields).toEqual([]);
  });

  it("returns need_info when a required field is unknown", () => {
    const v = evaluate({ ...eligibleOldAge(), age: null }, OLD_AGE);
    expect(v.status).toBe("need_info");
    expect(v.missingFields).toEqual(["age"]);
    expect(v.reasons).toEqual(["Aged 60 or above"]);
  });

  it("treats a wholly-empty profile as need_info, never eligible", () => {
    const v = evaluate(profile(), OLD_AGE);
    expect(v.status).toBe("need_info");
    // every field a rule touches is missing (criteria + exclusions), de-duplicated
    expect(v.missingFields).toEqual([
      "income_tax_payer",
      "govt_employee",
      "is_tamil_nadu",
      "age",
      "monthly_income",
    ]);
  });

  it("a scheme with no rules is vacuously eligible", () => {
    const empty = scheme({ id: "empty" });
    const v = evaluate(profile(), empty);
    expect(v.status).toBe("eligible");
    expect(v.reasons).toEqual([]);
  });
});

describe("precedence: definitive disqualification beats need_info", () => {
  it("exclusion-true wins over an unknown criterion", () => {
    // age unknown (would be need_info) but taxpayer is a definitive exclusion
    const p = { ...eligibleOldAge(), age: null, income_tax_payer: true };
    const v = evaluate(p, OLD_AGE);
    expect(v.status).toBe("not_eligible");
    expect(v.reasons).toEqual(["Income-tax payers are not eligible"]);
    expect(v.missingFields).toEqual([]); // no questions once ruled out
  });

  it("criterion-false wins over an unknown exclusion", () => {
    // income_tax_payer unknown (would be need_info) but age is known-failing
    const p = { ...eligibleOldAge(), age: 30, income_tax_payer: null };
    const v = evaluate(p, OLD_AGE);
    expect(v.status).toBe("not_eligible");
    expect(v.reasons).toContain("Aged 60 or above");
    expect(v.missingFields).toEqual([]);
  });

  it("reports both a triggered exclusion and a failed criterion (exclusions first)", () => {
    const p = { ...eligibleOldAge(), age: 30, income_tax_payer: true };
    const v = evaluate(p, OLD_AGE);
    expect(v.status).toBe("not_eligible");
    expect(v.reasons).toEqual([
      "Income-tax payers are not eligible", // exclusions are listed first
      "Aged 60 or above",
    ]);
  });
});

describe("need_info details", () => {
  it("an unknown EXCLUSION field also drives need_info (can't confirm clear)", () => {
    // all criteria pass, but we don't know if they're a taxpayer
    const p = { ...eligibleOldAge(), income_tax_payer: null };
    const v = evaluate(p, OLD_AGE);
    expect(v.status).toBe("need_info");
    expect(v.missingFields).toEqual(["income_tax_payer"]);
  });

  it("de-duplicates a field referenced by more than one rule", () => {
    // monthly_income appears as both a criterion and an exclusion here
    const s = scheme({
      id: "dup_field",
      criteria: [{ field: "monthly_income", op: "lte", value: 5000, label: "income low enough" }],
      exclusions: [{ field: "monthly_income", op: "gte", value: 100000, label: "income too high" }],
    });
    const v = evaluate(profile(), s); // income unknown
    expect(v.status).toBe("need_info");
    expect(v.missingFields).toEqual(["monthly_income"]); // once, not twice
  });

  it("lists missing exclusion fields before missing criterion fields", () => {
    const p = profile({ age: 70, monthly_income: 1000, is_tamil_nadu: true });
    // unknown: income_tax_payer + govt_employee (exclusions). criteria all known/pass.
    const v = evaluate(p, OLD_AGE);
    expect(v.status).toBe("need_info");
    expect(v.missingFields).toEqual(["income_tax_payer", "govt_employee"]);
  });
});

describe("operator coverage", () => {
  it("gte is inclusive at the boundary", () => {
    expect(evaluate({ ...eligibleOldAge(), age: 60 }, OLD_AGE).status).toBe("eligible");
    expect(evaluate({ ...eligibleOldAge(), age: 59 }, OLD_AGE).status).toBe("not_eligible");
  });

  it("lte is inclusive at the boundary", () => {
    expect(evaluate({ ...eligibleOldAge(), monthly_income: 5000 }, OLD_AGE).status).toBe("eligible");
    expect(evaluate({ ...eligibleOldAge(), monthly_income: 5001 }, OLD_AGE).status).toBe("not_eligible");
  });

  it("gt and lt are strict; eq(boolean) and false-op work", () => {
    const pass = profile({
      land_acres_wet: 4, // lt 5  ✓
      disability_percent: 10, // gt 0 ✓
      income_tax_payer: false, // false-op ✓
      is_family_head: true, // eq true ✓
    });
    expect(evaluate(pass, OP_COVERAGE).status).toBe("eligible");

    // boundaries / negatives
    expect(evaluate({ ...pass, land_acres_wet: 5 }, OP_COVERAGE).status).toBe("not_eligible"); // lt strict
    expect(evaluate({ ...pass, disability_percent: 0 }, OP_COVERAGE).status).toBe("not_eligible"); // gt strict
    expect(evaluate({ ...pass, income_tax_payer: true }, OP_COVERAGE).status).toBe("not_eligible"); // false-op
    expect(evaluate({ ...pass, is_family_head: false }, OP_COVERAGE).status).toBe("not_eligible"); // eq true
  });

  it("eq on string fields matches exactly", () => {
    const base = profile({
      is_tamil_nadu: true,
      gender: "female",
      marital_status: "widowed",
      monthly_income: 1000,
      income_tax_payer: false,
    });
    expect(evaluate(base, WIDOW).status).toBe("eligible");
    expect(evaluate({ ...base, gender: "male" }, WIDOW).status).toBe("not_eligible");
    expect(evaluate({ ...base, marital_status: "married" }, WIDOW).status).toBe("not_eligible");
  });
});

describe("widow / old-age double eligibility", () => {
  it("a 67-year-old destitute widow is eligible for BOTH schemes", () => {
    const p = profile({
      is_tamil_nadu: true,
      age: 67,
      gender: "female",
      marital_status: "widowed",
      monthly_income: 800,
      income_tax_payer: false,
      govt_employee: false,
    });

    const oldAge = evaluate(p, OLD_AGE);
    const widow = evaluate(p, WIDOW);

    expect(oldAge.status).toBe("eligible");
    expect(widow.status).toBe("eligible");

    // verdicts are scheme-scoped and carry the right rule version
    expect(oldAge.schemeId).toBe("old_age");
    expect(oldAge.ruleVersion).toBe(3);
    expect(widow.schemeId).toBe("widow");
    expect(widow.ruleVersion).toBe(2);
  });

  it("evaluating one scheme is independent of another's fields", () => {
    // No gender/marital info → widow needs_info, but old-age is unaffected
    const p = profile({
      is_tamil_nadu: true,
      age: 67,
      monthly_income: 800,
      income_tax_payer: false,
      govt_employee: false,
    });
    expect(evaluate(p, OLD_AGE).status).toBe("eligible");
    expect(evaluate(p, WIDOW).status).toBe("need_info");
    expect(evaluate(p, DISABILITY).status).toBe("need_info"); // disability_percent unknown
  });
});

describe("verdict shape", () => {
  it("always carries schemeId and ruleVersion from the scheme", () => {
    const v = evaluate(profile(), WIDOW);
    expect(v.schemeId).toBe("widow");
    expect(v.ruleVersion).toBe(2);
    expect(Array.isArray(v.reasons)).toBe(true);
    expect(Array.isArray(v.missingFields)).toBe(true);
  });
});

describe("malformed rule data fails loudly", () => {
  it("throws when a numeric op has a non-numeric threshold", () => {
    const bad = scheme({
      id: "bad",
      criteria: [{ field: "age", op: "gte", value: "sixty" as unknown as number, label: "bad age rule" }],
    });
    expect(() => evaluate(profile({ age: 65 }), bad)).toThrow(/Malformed rule/);
  });

  it("throws when a numeric op is missing its threshold value", () => {
    const bad = scheme({
      id: "bad2",
      criteria: [{ field: "land_acres_wet", op: "lte", label: "missing value" }],
    });
    expect(() => evaluate(profile({ land_acres_wet: 2 }), bad)).toThrow(/Malformed rule/);
  });

  it("does NOT throw for a malformed numeric rule when the field is unknown", () => {
    // unknown short-circuits before the type check — stays need_info
    const bad = scheme({
      id: "bad3",
      criteria: [{ field: "age", op: "gte", value: "sixty" as unknown as number, label: "bad age rule" }],
    });
    expect(evaluate(profile({ age: null }), bad).status).toBe("need_info");
  });
});
