import { describe, it, expect } from "vitest";
import { EMPTY_PROFILE, type Profile, type Verdict } from "@urimai/types";
import { SEED_SCHEMES } from "@urimai/db";
import { createOrchestrator, type SessionStore } from "../src/index.js";

function memoryStore(): SessionStore {
  const m = new Map<string, string>();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v), del: async (k) => void m.delete(k) };
}
const full = (o: Partial<Profile>): Profile => ({ ...EMPTY_PROFILE, ...o });
const byId = (vs: Verdict[], id: string) => vs.find((v) => v.schemeId === id)!;

describe("dashboard path (web channel): assess + reassess", () => {
  it("assess() returns the merged profile and ALL four verdicts in one call", async () => {
    const orch = createOrchestrator({
      store: memoryStore(),
      extract: async () => full({ age: 67, gender: "female", marital_status: "widowed", is_tamil_nadu: true }),
      loadSchemes: async () => SEED_SCHEMES,
    });

    const a = await orch.assess("s1", "67 year old widow in Madurai");
    expect(a.profile.age).toBe(67);
    // No next-question picker — every scheme assessed (4 schemes: central IGNWPS/IGNDPS
    // folded into widow/disabled as of July 2026 — funding streams, not separate schemes).
    expect(a.verdicts).toHaveLength(4);
    expect(byId(a.verdicts, "widow").status).toBe("need_info"); // still missing income/assets
  });

  it("reassess() re-evaluates an edited profile server-side and can CLEAR a field", async () => {
    const store = memoryStore();
    const orch = createOrchestrator({
      store,
      extract: async () => full({ age: 67, gender: "female", marital_status: "widowed", is_tamil_nadu: true }),
      loadSchemes: async () => SEED_SCHEMES,
    });

    const a = await orch.assess("s2", "anything");
    // Operator completes the destitute-widow picture by editing fields directly.
    // (oldage now also requires is_bpl per July-2026 curator sign-off.)
    const edited = full({
      ...a.profile,
      has_regular_income: false,
      fixed_assets_value: 10000,
      is_bpl: true,
    });
    const b = await orch.reassess("s2", edited);
    expect(byId(b.verdicts, "widow").status).toBe("eligible");
    expect(byId(b.verdicts, "oldage").status).toBe("eligible");

    // Clearing a field (operator correction) actually clears — overwrite, not merge.
    const cleared = full({ ...b.profile, fixed_assets_value: null });
    const c = await orch.reassess("s2", cleared);
    expect(c.profile.fixed_assets_value).toBeNull();
    expect(byId(c.verdicts, "widow").status).toBe("need_info"); // back to needing the asset value
  });
});
