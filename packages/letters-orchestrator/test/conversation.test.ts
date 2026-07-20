/**
 * The Phase 3 acceptance conversation: narration → type confirmation → gap questions →
 * draft → one correction → approval → final LetterDraft, with every draft and the
 * approval logged, and the session cleared after approval.
 */
import { describe, it, expect } from "vitest";
import type { LetterDraft } from "@urimai/types";
import { assembleLetterText } from "@urimai/docgen";
import { createLettersOrchestrator } from "../src/orchestrator.js";
import { makeFakeDeps } from "./helpers.js";

/** The printed letter text must never carry the AI disclaimer (voice-only). */
const assembleTextHasNoDisclaimer = (draft: LetterDraft) => !assembleLetterText(draft).includes("AI");

describe("full letters conversation", () => {
  it("drives narration → confirm → gap loop → readback → correction → approval", async () => {
    const f = makeFakeDeps("police_complaint");
    const orch = createLettersOrchestrator(f.deps);
    const sid = "t1";

    // Fresh session speaks the listen prompt.
    const start = await orch.startSession(sid);
    expect(start.kind).toBe("listen");

    // Turn 1 — narration with some facts: classified, then confirmed in plain words.
    f.queueExtract({ sender_name: "முருகன்", incident_details: "வீட்டில் திருட்டு", incident_place: "எங்க வீடு" });
    const t1 = await orch.handleTurn(sid, "நேத்து எங்க வீட்டுல திருட்டு நடந்தது, புகார் எழுதணும். நான் முருகன்.");
    expect(t1.kind).toBe("confirm_type");
    if (t1.kind !== "confirm_type") throw new Error("unreachable");
    expect(t1.typeId).toBe("police_complaint");
    expect(t1.prompt.ta).toContain("காவல்");

    // Turn 2 — "yes": the gap loop starts with the FIRST missing required fact in
    // the type's declared order (sender_address; name/place/details already known).
    const t2 = await orch.handleTurn(sid, "ஆம்");
    expect(t2.kind).toBe("question");
    if (t2.kind !== "question") throw new Error("unreachable");
    expect(t2.fact).toBe("sender_address");

    // Turn 3 — address arrives; next missing is incident_date, with pendingFact passed
    // to the extractor so a bare answer lands on the right key.
    f.queueExtract({ sender_address: "கடலூர்" });
    const t3 = await orch.handleTurn(sid, "கடலூர்");
    expect(t3.kind).toBe("question");
    if (t3.kind !== "question") throw new Error("unreachable");
    expect(t3.fact).toBe("incident_date");
    expect(f.calls.extract.at(-1)?.pendingFact).toBe("sender_address");

    // Turn 4 — date arrives; v2 types always ask WHO the letter goes to next.
    f.queueExtract({ incident_date: "நேத்து ராத்திரி" });
    const t4 = await orch.handleTurn(sid, "நேத்து ராத்திரி");
    expect(t4.kind).toBe("question");
    if (t4.kind !== "question") throw new Error("unreachable");
    expect(t4.fact).toBe("addressee_office");

    // Turn 4b — "தெரியலை" skips it: the resolved (web/directory) office fills the
    // addressee, the draft appears, and the SPOKEN disclaimer is the LAST chunk —
    // told to the user, never printed on the letter.
    const t4b = await orch.handleTurn(sid, "தெரியலை");
    expect(t4b.kind).toBe("readback");
    if (t4b.kind !== "readback") throw new Error("unreachable");
    expect(t4b.revisions).toBe(0);
    expect(t4b.draft.addresseeBlock).toBe("தேடல்-அலுவலகம்"); // resolved To office used
    expect(f.calls.resolve).toBe(1); // addressee resolved exactly once per letter
    expect(t4b.chunks.at(-1)).toContain("AI"); // spoken disclaimer, appended after the letter
    expect(assembleTextHasNoDisclaimer(t4b.draft)).toBe(true);
    expect(t4b.draft.bodyParagraphs.join()).toContain("திருட்டு");
    expect(f.drafts).toHaveLength(1);

    // Turn 5a — an ambiguous reply gets ONE clarifying question: no re-draft, no
    // revision burnt, no re-read (live-tester fix — the old loop re-read everything).
    const t5a = await orch.handleTurn(sid, "ம்ம் அது வந்து");
    expect(t5a.kind).toBe("clarify");
    expect(f.drafts).toHaveLength(1);

    // Turn 5 — a correction: re-draft with the instruction, revision counted, logged,
    // and ONLY the changed part read back.
    f.queueExtract({});
    const t5 = await orch.handleTurn(sid, "தேதியை மாத்துங்க — 18-07-2026 னு போடுங்க");
    expect(t5.kind).toBe("readback");
    if (t5.kind !== "readback") throw new Error("unreachable");
    expect(t5.revisions).toBe(1);
    expect(t5.changedOnly).toBe(true);
    expect(f.calls.resolve).toBe(1); // NOT re-resolved on revision — no address drift
    expect(t5.chunks.join()).toContain("திருத்தம்"); // the changed paragraph is spoken...
    expect(t5.chunks.join()).not.toContain("அனுப்புநர்"); // ...but the unchanged header is not
    expect(t5.draft.bodyParagraphs.join()).toContain("திருத்தம்");
    expect(f.drafts).toHaveLength(2);

    // Turn 6 — explicit approval: hash + utterance logged against the LAST draft id,
    // and the session is cleared for the next person.
    const t6 = await orch.handleTurn(sid, "சரி அனுப்புங்க");
    expect(t6.kind).toBe("approved");
    if (t6.kind !== "approved") throw new Error("unreachable");
    expect(t6.revisions).toBe(1);
    expect(t6.approvalUtterance).toBe("சரி அனுப்புங்க");
    expect(t6.draftHash).toMatch(/^[0-9a-f]{64}$/);
    expect(f.approvals).toEqual([{ draftId: "draft-2", approvalUtterance: "சரி அனுப்புங்க", revisions: 1 }]);
    expect(await orch.isNewSession(sid)).toBe(true);
  });

  it("a 'no' to type confirmation falls back to the generic petition — never turned away", async () => {
    const f = makeFakeDeps("wage_complaint");
    const orch = createLettersOrchestrator(f.deps);
    f.queueExtract({ incident_details: "ஏதோ பிரச்சனை" });
    await orch.handleTurn("t2", "ஏதோ ஒரு பிரச்சனை");
    const r = await orch.handleTurn("t2", "இல்லை");
    expect(r.kind).toBe("question");
    if (r.kind !== "question") throw new Error("unreachable");
    expect(r.typeId).toBe("generic_petition");
  });

  it("'நகல் வேண்டாம்' at read-back drops the curated CC and reports the removal", async () => {
    const f = makeFakeDeps("generic_petition");
    const orch = createLettersOrchestrator(f.deps);
    const sid = "cc";
    f.queueExtract({ sender_name: "லட்சுமி", incident_details: "வீட்டுல கஷ்டம்" });
    await orch.handleTurn(sid, "மனு எழுதணும், என் பேரு லட்சுமி, வீட்டுல கஷ்டம்");
    const rb = await orch.handleTurn(sid, "ஆம்");
    if (rb.kind !== "readback") throw new Error(`expected readback, got ${rb.kind}`);
    expect(rb.draft.copyTo).toContain("நகல்-அலுவலகம்"); // curated CC present by default

    f.queueExtract({});
    const r = await orch.handleTurn(sid, "நகல் வேண்டாம்");
    if (r.kind !== "readback") throw new Error(`expected readback, got ${r.kind}`);
    expect(r.draft.copyTo).toBeNull();
    expect(r.chunks.join()).toContain("நீக்கிவிட்டேன்"); // removal acknowledged, not "no change"
  });

  it("'தெரியலை' on an asked fact skips it (blank later) and moves on without re-asking", async () => {
    const f = makeFakeDeps("civic_grievance");
    const orch = createLettersOrchestrator(f.deps);
    const sid = "t3";
    // civic_grievance requires: sender_name, sender_address, incident_place, incident_details
    f.queueExtract({ incident_details: "சாக்கடை ஓவர்ஃப்ளோ", incident_place: "காமராஜர் தெரு" });
    await orch.handleTurn(sid, "சாக்கடை பிரச்சனை பற்றி கடிதம்");
    const q1 = await orch.handleTurn(sid, "ஆம்");
    if (q1.kind !== "question") throw new Error(`expected question, got ${q1.kind}`);
    expect(q1.fact).toBe("sender_name");

    const q2 = await orch.handleTurn(sid, "தெரியலை");
    if (q2.kind !== "question") throw new Error(`expected question, got ${q2.kind}`);
    expect(q2.fact).toBe("sender_address"); // moved on; sender_name skipped, not re-asked
    // No extraction call was made for the "தெரியலை" turn.
    expect(f.calls.extract.at(-1)?.text).not.toBe("தெரியலை");
  });
});
