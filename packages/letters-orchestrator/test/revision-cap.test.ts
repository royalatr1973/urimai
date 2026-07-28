import { describe, it, expect } from "vitest";
import { createLettersOrchestrator } from "../src/orchestrator.js";
import { makeFakeDeps } from "./helpers.js";

describe("revision cap (§7.6 — cap at N, then offer escalation)", () => {
  it("allows N corrections, escalates on the N+1th, and still lets the user approve", async () => {
    const f = makeFakeDeps("generic_petition", null); // no category → addressee + copy asked
    const orch = createLettersOrchestrator({ ...f.deps, revisionCap: 2 });
    const sid = "cap";

    // Reach the read-back (generic v3 asks addressee + copy too).
    f.queueExtract({ sender_name: "லட்சுமி", sender_address: "கடலூர்", incident_details: "வீட்டுல கஷ்டம்", addressee_office: "வட்டாட்சியர் அலுவலகம்" });
    await orch.handleTurn(sid, "வட்டாட்சியருக்கு ஒரு மனு எழுதணும், என் பேரு லட்சுமி, வீட்டுல கஷ்டம்");
    await orch.handleTurn(sid, "ஆம்"); // → copy_to question
    const rb = await orch.handleTurn(sid, "வேண்டாம்");
    expect(rb.kind).toBe("readback");

    // Two corrections pass...
    f.queueExtract({}, {});
    expect((await orch.handleTurn(sid, "இன்னும் கொஞ்சம் விளக்கமா எழுது")).kind).toBe("readback");
    expect((await orch.handleTurn(sid, "தலைப்பை மாத்து")).kind).toBe("readback");

    // ...the third escalates instead of looping forever.
    const esc = await orch.handleTurn(sid, "மறுபடியும் மாத்து");
    expect(esc.kind).toBe("escalate");
    if (esc.kind !== "escalate") throw new Error("unreachable");
    expect(esc.revisions).toBe(2);

    // Escalation is an offer, not a dead end — an explicit approval still delivers.
    const ok = await orch.handleTurn(sid, "சரி");
    expect(ok.kind).toBe("deliver");
    expect(f.approvals).toHaveLength(1);
  });
});
