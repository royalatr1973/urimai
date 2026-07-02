import { describe, it, expect } from "vitest";
import { EMPTY_PROFILE, type Profile, type Verdict } from "@urimai/types";
import { SEED_SCHEMES } from "@urimai/db";
import { decideNext, mergeProfiles } from "../src/index.js";

const profile = (o: Partial<Profile> = {}): Profile => ({ ...EMPTY_PROFILE, ...o });
const byId = (vs: Verdict[], id: string) => vs.find((v) => v.schemeId === id)!;

describe("decideNext (against the real seeded rules)", () => {
  it("with nothing known, asks the single most-unblocking question first (residency)", () => {
    const r = decideNext(profile(), SEED_SCHEMES);
    expect(r.kind).toBe("question");
    if (r.kind !== "question") throw new Error("unreachable");
    // is_tamil_nadu is referenced by all four schemes → highest value.
    expect(r.field).toBe("is_tamil_nadu");
  });

  it("delivers results once every scheme is resolved", () => {
    // A man, 65, destitute, few assets, not disabled, in TN.
    const r = decideNext(
      profile({
        gender: "male",
        age: 65,
        is_tamil_nadu: true,
        has_regular_income: false,
        fixed_assets_value: 10000,
        disability_percent: 0,
      }),
      SEED_SCHEMES,
    );
    expect(r.kind).toBe("results");
    if (r.kind !== "results") throw new Error("unreachable");
    expect(byId(r.verdicts, "oldage").status).toBe("eligible");
    expect(byId(r.verdicts, "widow").status).toBe("not_eligible"); // not a woman
    expect(byId(r.verdicts, "kmut").status).toBe("not_eligible"); // not a woman/transgender head
    expect(byId(r.verdicts, "disabled").status).toBe("not_eligible"); // 0% disability
  });

  it("never asks a question for a field that only affects an already-resolved scheme", () => {
    // KMIT is dead (man), widow is dead (man), disabled is dead (0%). Only oldage is open,
    // missing has_regular_income. So KMUT-only fields must NOT be asked.
    const r = decideNext(
      profile({
        gender: "male",
        age: 65,
        is_tamil_nadu: true,
        fixed_assets_value: 10000,
        disability_percent: 0,
        // has_regular_income left unknown
      }),
      SEED_SCHEMES,
    );
    expect(r.kind).toBe("question");
    if (r.kind !== "question") throw new Error("unreachable");
    expect(r.field).toBe("has_regular_income");
    const kmutOnly = ["is_family_head", "owns_four_wheeler", "annual_electricity_units", "annual_family_income"];
    expect(kmutOnly).not.toContain(r.field);
  });

  it("the asked field is always one the current verdicts actually need (no dead-ends)", () => {
    const r = decideNext(profile({ is_tamil_nadu: true, age: 70 }), SEED_SCHEMES);
    if (r.kind !== "question") throw new Error("expected a question");
    const needed = new Set(r.verdicts.flatMap((v) => v.missingFields));
    expect(needed.has(r.field)).toBe(true);
  });

  it("never asks for monthly_income (no scheme rule references it)", () => {
    // Drive many states; monthly_income must never surface as the question.
    const states: Partial<Profile>[] = [
      {},
      { is_tamil_nadu: true },
      { is_tamil_nadu: true, age: 67, gender: "female", marital_status: "widowed" },
      { is_tamil_nadu: true, age: 67, gender: "female", marital_status: "widowed", has_regular_income: false },
    ];
    for (const s of states) {
      const r = decideNext(profile(s), SEED_SCHEMES);
      if (r.kind === "question") expect(r.field).not.toBe("monthly_income");
    }
  });
});

describe("mergeProfiles", () => {
  it("new non-null values update; nulls never erase known facts", () => {
    const base = profile({ age: 67, gender: "female" });
    const merged = mergeProfiles(base, profile({ has_regular_income: false })); // age/gender null in update
    expect(merged.age).toBe(67);
    expect(merged.gender).toBe("female");
    expect(merged.has_regular_income).toBe(false);
  });

  it("a later non-null value overwrites an earlier one (correction)", () => {
    const merged = mergeProfiles(profile({ age: 40 }), profile({ age: 41 }));
    expect(merged.age).toBe(41);
  });
});
