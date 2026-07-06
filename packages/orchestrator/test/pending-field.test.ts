import { describe, it, expect } from "vitest";
import { EMPTY_PROFILE, type Profile } from "@urimai/types";
import { SEED_SCHEMES } from "@urimai/db";
import { createOrchestrator, type SessionStore } from "../src/index.js";

function memoryStore(): SessionStore {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
    del: async (k) => void m.delete(k),
  };
}
const full = (o: Partial<Profile>): Profile => ({ ...EMPTY_PROFILE, ...o });

describe("pending-field context — bare answers land on the right field", () => {
  it("passes the field asked in the previous turn to the extractor on the next turn", async () => {
    const seen: Array<{ text: string; pending: string | null | undefined }> = [];
    // Extractor that only returns something useful when it knows the pending field.
    const extract = async (text: string, pendingField?: keyof Profile | null) => {
      seen.push({ text, pending: pendingField ?? null });
      if (text === "67 widow madurai") {
        return full({ age: 67, gender: "female", marital_status: "widowed", is_tamil_nadu: true });
      }
      // The whole point: extract "no" only when we're told the pending field is disability.
      if (text === "no" && pendingField === "disability_percent") return full({ disability_percent: 0 });
      return { ...EMPTY_PROFILE };
    };

    const orch = createOrchestrator({
      store: memoryStore(),
      extract,
      loadSchemes: async () => SEED_SCHEMES,
    });

    const session = "wa:999";
    // Turn 1: nothing pending yet — the extractor sees pendingField = null.
    const r1 = await orch.handleTurn(session, "67 widow madurai");
    expect(seen[0]).toEqual({ text: "67 widow madurai", pending: null });
    // Turn 1 asked *some* question — the answer to which becomes the pending field.
    expect(r1.kind).toBe("question");

    // Force the second turn's question to be about disability by pre-filling everything
    // else the widow/oldage schemes need. We do that by seeding via a scripted extraction:
    await orch.handleTurn(session, "seed"); // extractor returns empty; no state change
    // Instead of scripting further seeding, drive it by inspecting the actual r1 field —
    // then answer that field with a bare answer to demonstrate the mechanism.
    const askedField = r1.kind === "question" ? r1.field : null;
    expect(askedField).not.toBeNull();
    seen.length = 0;
    await orch.handleTurn(session, "bare-answer");
    // The critical assertion: the extractor was told which field we last asked about.
    expect(seen[0]!.pending).toBe(askedField);
  });

  it("session with disability pending: bare 'no' → disability_percent: 0 → disabled scheme resolves", async () => {
    const extract = async (text: string, pendingField?: keyof Profile | null) => {
      if (text.startsWith("67 widow")) {
        return full({
          age: 67,
          gender: "female",
          marital_status: "widowed",
          is_tamil_nadu: true,
          has_regular_income: false,
          fixed_assets_value: 10000,
          // Set is_bpl false so oldage/igndps are decided (not eligible) and don't compete
          // with disability_percent for the "next question" slot.
          is_bpl: false,
          annual_family_income: 50000,
        });
      }
      // With pendingField hint, bare "no" resolves to 0% disability.
      if (text === "no" && pendingField === "disability_percent") return full({ disability_percent: 0 });
      return { ...EMPTY_PROFILE };
    };

    const orch = createOrchestrator({
      store: memoryStore(),
      extract,
      loadSchemes: async () => SEED_SCHEMES,
    });

    const session = "wa:widow";
    const r1 = await orch.handleTurn(session, "67 widow destitute madurai no assets no bpl 50k income");
    expect(r1.kind).toBe("question");
    if (r1.kind !== "question") throw new Error("unreachable");
    // Widow eligible; oldage NOT eligible (no BPL); kmut needs is_family_head; disabled needs
    // disability_percent; IGNWPS not_eligible (age); IGNDPS not_eligible (no BPL).
    // is_family_head and disability_percent both count 1. By FIELD_PRIORITY, disability_percent
    // (position 7) beats is_family_head (position 8).
    expect(r1.field).toBe("disability_percent");

    // Bare "no" — without pendingField this would drop and re-ask; with it, disability_percent
    // becomes 0 and the disabled scheme flips to not_eligible (the engine advances).
    const r2 = await orch.handleTurn(session, "no");
    // Whatever question comes next MUST NOT be disability_percent again — that's the whole
    // point: the bare "no" was resolved and the engine moved on.
    if (r2.kind === "question") {
      expect(r2.field).not.toBe("disability_percent");
      expect(r2.verdicts.find((v) => v.schemeId === "disabled")?.status).toBe("not_eligible");
    } else {
      expect(r2.verdicts.find((v) => v.schemeId === "disabled")?.status).toBe("not_eligible");
    }
  });
});
