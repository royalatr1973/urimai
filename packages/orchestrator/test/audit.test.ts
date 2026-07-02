import { describe, it, expect, vi } from "vitest";
import { EMPTY_PROFILE, type Profile } from "@urimai/types";
import { SEED_SCHEMES } from "@urimai/db";
import { createOrchestrator, type AuditEntry, type SessionStore } from "../src/index.js";

function memoryStore(): SessionStore {
  const m = new Map<string, string>();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v), del: async (k) => void m.delete(k) };
}
const full = (o: Partial<Profile>): Profile => ({ ...EMPTY_PROFILE, ...o });

describe("audit sink fires on every evaluation path", () => {
  const make = () => {
    const audit = vi.fn<(e: AuditEntry) => Promise<void>>(async () => {});
    const orch = createOrchestrator({
      store: memoryStore(),
      extract: async () => full({ age: 67, gender: "female", marital_status: "widowed", is_tamil_nadu: true }),
      loadSchemes: async () => SEED_SCHEMES,
      audit,
    });
    return { orch, audit };
  };

  it("handleTurn audits the verdicts (with rule version)", async () => {
    const { orch, audit } = make();
    await orch.handleTurn("s", "67 year old widow");
    expect(audit).toHaveBeenCalledOnce();
    const entry = audit.mock.calls[0]![0];
    expect(entry.sessionId).toBe("s");
    expect(entry.verdicts.length).toBe(SEED_SCHEMES.length);
    expect(entry.verdicts.every((v) => typeof v.ruleVersion === "number")).toBe(true);
  });

  it("assess and reassess both audit", async () => {
    const { orch, audit } = make();
    await orch.assess("s", "text");
    const a = audit.mock.calls.length;
    await orch.reassess("s", full({ age: 67 }));
    expect(audit.mock.calls.length).toBe(a + 1);
  });

  it("audit inputs are the no-PII profile (discovery collects zero identity)", async () => {
    const { orch, audit } = make();
    await orch.assess("s", "text");
    const entry = audit.mock.calls[0]![0];
    // The profile keys are eligibility facts only — no name/aadhaar/phone fields exist on it.
    for (const forbidden of ["name", "aadhaar", "phone", "address"]) {
      expect(Object.keys(entry.profile)).not.toContain(forbidden);
    }
  });
});
