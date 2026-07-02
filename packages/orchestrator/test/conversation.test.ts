import { describe, it, expect } from "vitest";
import { EMPTY_PROFILE, type Profile, type Verdict } from "@urimai/types";
import { SEED_SCHEMES } from "@urimai/db";
import { createOrchestrator, type SessionStore } from "../src/index.js";

/** In-memory session store (stands in for Redis; same contract). */
function memoryStore(): SessionStore {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => {
      m.set(k, v);
      return "OK";
    },
  };
}

/** A scripted extractor: maps each exact user utterance to a deterministic partial profile. */
function scriptedExtractor(script: Record<string, Partial<Profile>>) {
  return async (text: string): Promise<Profile> => {
    if (!(text in script)) throw new Error(`unscripted input: ${text}`);
    return { ...EMPTY_PROFILE, ...script[text] };
  };
}

const byId = (vs: Verdict[], id: string) => vs.find((v) => v.schemeId === id)!;

describe("scripted conversation → correct verdicts (end-to-end: merge → engine)", () => {
  it("drives a 67-yr-old destitute widow in Madurai to the right multi-scheme outcome", async () => {
    const script: Record<string, Partial<Profile>> = {
      "I am a 67 year old widow living in Madurai": {
        age: 67,
        gender: "female",
        marital_status: "widowed",
        state: "Tamil Nadu",
        is_tamil_nadu: true,
      },
      "I have no regular income, I am destitute": { has_regular_income: false },
      "I own no property, only about ten thousand rupees of things": { fixed_assets_value: 10000 },
      "No, I am not disabled": { disability_percent: 0 },
      "Yes, I am the head of my family": { is_family_head: true },
      "Our family earns about 80,000 a year; no land, no car, no government job, no income or professional tax, no pension, no bank or PSU job, no elected member, normal home electricity":
        {
          annual_family_income: 80000,
          land_acres_wet: 0,
          land_acres_dry: 0,
          owns_four_wheeler: false,
          govt_employee: false,
          income_tax_payer: false,
          professional_tax_payer: false,
          is_pensioner: false,
          psu_or_bank_employee: false,
          elected_representative: false,
          annual_electricity_units: 1200,
        },
    };

    const orch = createOrchestrator({
      store: memoryStore(),
      extract: scriptedExtractor(script),
      loadSchemes: async () => SEED_SCHEMES,
    });

    const session = "widow-madurai";
    const turns = Object.keys(script);
    const askedFields: string[] = [];

    let last;
    for (const text of turns) {
      last = await orch.handleTurn(session, text);
      if (last.kind === "question") {
        askedFields.push(last.field);
        // No dead-ends: the asked field is genuinely needed by a current verdict.
        const needed = new Set(last.verdicts.flatMap((v) => v.missingFields));
        expect(needed.has(last.field)).toBe(true);
      }
    }

    // The gap questions were asked highest-value-first, and only relevant ones.
    expect(askedFields).toEqual([
      "has_regular_income",
      "fixed_assets_value",
      "disability_percent",
      "is_family_head",
      "annual_family_income",
    ]);

    // Final turn delivers results.
    expect(last!.kind).toBe("results");
    if (last!.kind !== "results") throw new Error("unreachable");
    expect(byId(last!.verdicts, "oldage").status).toBe("eligible");
    expect(byId(last!.verdicts, "widow").status).toBe("eligible");
    expect(byId(last!.verdicts, "kmut").status).toBe("eligible");
    expect(byId(last!.verdicts, "disabled").status).toBe("not_eligible");

    // Session state accumulated across turns (the Redis-merge path).
    expect(last!.profile.age).toBe(67);
    expect(last!.profile.annual_family_income).toBe(80000);
    expect(last!.profile.is_tamil_nadu).toBe(true);
  });

  it("stops asking about a scheme once it is decided — no dead-end questions", async () => {
    // A man → KMUT and widow are dead from turn one; only disability remains open.
    const script: Record<string, Partial<Profile>> = {
      "I'm a 70 year old man in Salem, no regular income, I own nothing": {
        age: 70,
        gender: "male",
        state: "Tamil Nadu",
        is_tamil_nadu: true,
        has_regular_income: false,
        fixed_assets_value: 0,
      },
      "I have 50 percent disability": { disability_percent: 50 },
    };

    const orch = createOrchestrator({
      store: memoryStore(),
      extract: scriptedExtractor(script),
      loadSchemes: async () => SEED_SCHEMES,
    });

    const session = "man-salem";
    const asked: string[] = [];
    let last;
    for (const text of Object.keys(script)) {
      last = await orch.handleTurn(session, text);
      if (last.kind === "question") asked.push(last.field);
    }

    // Only disability was ever asked — never a KMUT-only field (the scheme was already dead).
    expect(asked).toEqual(["disability_percent"]);
    const kmutOnly = ["is_family_head", "owns_four_wheeler", "annual_electricity_units", "annual_family_income"];
    for (const f of kmutOnly) expect(asked).not.toContain(f);

    expect(last!.kind).toBe("results");
    if (last!.kind !== "results") throw new Error("unreachable");
    expect(byId(last!.verdicts, "oldage").status).toBe("eligible");
    expect(byId(last!.verdicts, "disabled").status).toBe("eligible");
    expect(byId(last!.verdicts, "widow").status).toBe("not_eligible");
    expect(byId(last!.verdicts, "kmut").status).toBe("not_eligible");
  });
});
