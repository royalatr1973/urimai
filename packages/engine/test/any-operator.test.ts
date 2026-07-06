import { describe, it, expect } from "vitest";
import type { Profile, Rule } from "@urimai/types";
import { EMPTY_PROFILE } from "@urimai/types";
import { evaluate } from "../src/index.js";
import { scheme } from "./fixtures.js";

const p = (o: Partial<Profile> = {}): Profile => ({ ...EMPTY_PROFILE, ...o });

/** A scheme whose sole criterion is an "any": (marital_status=married) OR (is_family_head=true) */
const anyRule: Rule = {
  op: "any",
  label: "Married OR is head of family",
  rules: [
    { op: "eq", field: "marital_status", value: "married", label: "Married" },
    { op: "true", field: "is_family_head", label: "Head of family" },
  ],
};

const S = scheme({ id: "any_test", criteria: [anyRule] });

describe('rules engine: "any" operator (OR-of-criteria)', () => {
  it("passes when the FIRST sub-rule is true", () => {
    const r = evaluate(p({ marital_status: "married", is_family_head: false }), S);
    expect(r.status).toBe("eligible");
  });

  it("passes when the SECOND sub-rule is true", () => {
    const r = evaluate(p({ marital_status: "widowed", is_family_head: true }), S);
    expect(r.status).toBe("eligible");
  });

  it("passes when BOTH sub-rules are true", () => {
    const r = evaluate(p({ marital_status: "married", is_family_head: true }), S);
    expect(r.status).toBe("eligible");
  });

  it("fails only when ALL sub-rules are known-false", () => {
    const r = evaluate(p({ marital_status: "unmarried", is_family_head: false }), S);
    expect(r.status).toBe("not_eligible");
    expect(r.reasons).toContain("Married OR is head of family");
  });

  it("is need_info when some sub-rules are unknown and none is yet true", () => {
    const r = evaluate(p({ marital_status: null, is_family_head: false }), S);
    expect(r.status).toBe("need_info");
    // The still-resolvable sub-rule's field surfaces as a gap.
    expect(r.missingFields).toContain("marital_status");
  });

  it("stops asking once the group is TRUE (short-circuit) — the other field is not requested", () => {
    // marital_status is already "married" → the whole any-rule passes. is_family_head being
    // null is IRRELEVANT — we should not ask about it just to satisfy this rule.
    const r = evaluate(p({ marital_status: "married", is_family_head: null }), S);
    expect(r.status).toBe("eligible");
    expect(r.missingFields).not.toContain("is_family_head");
  });

  it("contributes ALL unknown sub-rule fields to missingFields when none is true", () => {
    const r = evaluate(p({ marital_status: null, is_family_head: null }), S);
    expect(r.status).toBe("need_info");
    expect(r.missingFields).toEqual(expect.arrayContaining(["marital_status", "is_family_head"]));
  });

  it("does NOT re-ask about a sub-rule field that is already known-false (no dead-end)", () => {
    // marital_status = "widowed" → the first sub-rule (married) is definitively false, and
    // re-asking marital_status can't help. Only is_family_head is worth asking about.
    const r = evaluate(p({ marital_status: "widowed", is_family_head: null }), S);
    expect(r.status).toBe("need_info");
    expect(r.missingFields).toContain("is_family_head");
    expect(r.missingFields).not.toContain("marital_status");
  });

  it("throws when an 'any' rule has zero sub-rules (malformed data fails loudly)", () => {
    const bad = scheme({
      id: "bad_any",
      criteria: [{ op: "any", rules: [], label: "empty any" }],
    });
    expect(() => evaluate(p({ marital_status: "married" }), bad)).toThrow(/at least one sub-rule/);
  });

  it("plays correctly alongside other criteria in the same scheme (KMUT-shaped)", () => {
    // Real KMUT shape: gender + age + is_tamil_nadu + income + (married OR head) + ...
    const kmutish = scheme({
      id: "kmutish",
      criteria: [
        { op: "in", field: "gender", value: ["female", "other"], label: "Woman/transgender" },
        { op: "gte", field: "age", value: 21, label: "21+" },
        { op: "true", field: "is_tamil_nadu", label: "TN" },
        anyRule,
      ],
    });
    // Married 30-yr-old female in TN — passes via the any-rule's first sub-rule.
    const eligible = evaluate(
      p({ gender: "female", age: 30, is_tamil_nadu: true, marital_status: "married", is_family_head: false }),
      kmutish,
    );
    expect(eligible.status).toBe("eligible");
    // Unmarried woman who is NOT the head — the any-rule fails.
    const notEligible = evaluate(
      p({ gender: "female", age: 30, is_tamil_nadu: true, marital_status: "unmarried", is_family_head: false }),
      kmutish,
    );
    expect(notEligible.status).toBe("not_eligible");
  });
});
