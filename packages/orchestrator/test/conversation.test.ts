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
    del: async (k) => void m.delete(k),
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
      "I have no regular income, I am destitute; I have a BPL card": {
        has_regular_income: false,
        is_bpl: true,
      },
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

    let last;
    for (const text of turns) {
      last = await orch.handleTurn(session, text);
      if (last.kind === "question") {
        // No dead-ends: the asked field is genuinely needed by a current verdict.
        const needed = new Set(last.verdicts.flatMap((v) => v.missingFields));
        expect(needed.has(last.field)).toBe(true);
      }
    }

    // Final turn delivers results.
    expect(last!.kind).toBe("results");
    if (last!.kind !== "results") throw new Error("unreachable");
    expect(byId(last!.verdicts, "oldage").status).toBe("eligible"); // 60+, destitute, BPL, TN
    expect(byId(last!.verdicts, "widow").status).toBe("eligible");
    expect(byId(last!.verdicts, "kmut").status).toBe("eligible"); // she is the head — any-rule passes via that sub
    expect(byId(last!.verdicts, "disabled").status).toBe("not_eligible");

    // Session state accumulated across turns (the Redis-merge path).
    expect(last!.profile.age).toBe(67);
    expect(last!.profile.annual_family_income).toBe(80000);
    expect(last!.profile.is_tamil_nadu).toBe(true);
    expect(last!.profile.is_bpl).toBe(true);
  });

  it("counts questions asked across the session (drives the channel's progress recaps)", async () => {
    const script: Record<string, Partial<Profile>> = {
      "வணக்கம்": {},
      "தமிழ்நாடு": { state: "Tamil Nadu", is_tamil_nadu: true },
      "வயசு 67": { age: 67 },
    };
    const orch = createOrchestrator({
      store: memoryStore(),
      extract: scriptedExtractor(script),
      loadSchemes: async () => SEED_SCHEMES,
    });

    const r1 = await orch.handleTurn("count-session", "வணக்கம்");
    const r2 = await orch.handleTurn("count-session", "தமிழ்நாடு");
    const r3 = await orch.handleTurn("count-session", "வயசு 67");
    if (r1.kind !== "question" || r2.kind !== "question" || r3.kind !== "question") throw new Error("expected questions");
    expect(r1.questionsAsked).toBe(1);
    expect(r2.questionsAsked).toBe(2);
    expect(r3.questionsAsked).toBe(3);
  });

  it("stops asking about a scheme once it is decided — no dead-end questions", async () => {
    // A man in TN → KMUT/widow are dead from turn one (gender). Only oldage
    // (needs is_bpl) and disabled (needs disability + income) remain open.
    const script: Record<string, Partial<Profile>> = {
      "I'm a 70 year old man in Salem, no regular income, BPL family, ~30k a year, own nothing": {
        age: 70,
        gender: "male",
        state: "Tamil Nadu",
        is_tamil_nadu: true,
        has_regular_income: false,
        is_bpl: true,
        annual_family_income: 30000,
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

    // KMUT-only fields must never have been asked — the scheme was dead from turn one.
    const kmutOnly = ["is_family_head", "owns_four_wheeler", "annual_electricity_units"];
    for (const f of kmutOnly) expect(asked).not.toContain(f);

    expect(last!.kind).toBe("results");
    if (last!.kind !== "results") throw new Error("unreachable");
    expect(byId(last!.verdicts, "oldage").status).toBe("eligible"); // 60+, destitute, BPL, TN
    expect(byId(last!.verdicts, "disabled").status).toBe("eligible"); // 50% ≥ 40, destitute, income 30k ≤ 3L, TN
    expect(byId(last!.verdicts, "widow").status).toBe("not_eligible");
    expect(byId(last!.verdicts, "kmut").status).toBe("not_eligible");
  });
});
