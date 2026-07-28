/**
 * The Phase 3 acceptance conversation: narration → type confirmation → gap questions →
 * draft → one correction → approval → final LetterDraft, with every draft and the
 * approval logged, and the session cleared after approval.
 */
import { describe, it, expect } from "vitest";
import type { LetterDraft } from "@urimai/types";
import { assembleLetterText } from "@urimai/docgen";
import { createLettersOrchestrator, mergeFacts } from "../src/orchestrator.js";
import { makeFakeDeps } from "./helpers.js";

/** The printed letter text must never carry the AI disclaimer (voice-only). */
const assembleTextHasNoDisclaimer = (draft: LetterDraft) => !assembleLetterText(draft).includes("AI");

describe("mergeFacts — nothing the user says is lost", () => {
  it("narrative facts ACCUMULATE across turns instead of overwriting", () => {
    const first = "தங்க செயின் திருடு போச்சு";
    const extra = "அது என் அம்மாவோட செயின்";
    const base = { letterTypeId: null, language: null, incident_details: first };
    const merged = mergeFacts(base, { letterTypeId: null, language: null, incident_details: extra });
    expect(merged.incident_details).toBe(`${first} ${extra}`);
    // Re-extraction of the SAME detail does not duplicate it.
    expect(mergeFacts(merged, { letterTypeId: null, language: null, incident_details: extra }).incident_details).toBe(
      merged.incident_details,
    );
  });

  it("non-narrative facts still take the newest value", () => {
    const base = { letterTypeId: null, language: null, incident_date: "நேத்து" };
    expect(mergeFacts(base, { letterTypeId: null, language: null, incident_date: "18-07-2026" }).incident_date).toBe("18-07-2026");
  });
});

describe("full letters conversation", () => {
  it("drives narration → confirm → gap loop → readback → correction → approval", async () => {
    // No grievance category (generic path) — so the addressee + copy questions ARE asked.
    const f = makeFakeDeps("police_complaint", null);
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

    // Turn 4b — "தெரியலை" to the addressee: the COPY question is asked next (v3 —
    // both To and copy are always asked before anything is searched).
    const t4b = await orch.handleTurn(sid, "தெரியலை");
    expect(t4b.kind).toBe("question");
    if (t4b.kind !== "question") throw new Error("unreachable");
    expect(t4b.fact).toBe("copy_to");
    expect(f.calls.resolve).toBe(0); // nothing searched yet

    // Turn 4c — "தெரியலை" to the copy too: NOW the search runs (once, for both), the
    // found To office fills the addressee, the found CC lands on the நகல் line, and
    // the SPOKEN disclaimer is the last chunk — never printed on the letter.
    const t4c = await orch.handleTurn(sid, "தெரியலை");
    expect(t4c.kind).toBe("readback");
    if (t4c.kind !== "readback") throw new Error("unreachable");
    expect(t4c.revisions).toBe(0);
    expect(t4c.draft.addresseeBlock).toBe("தேடல்-அலுவலகம்"); // search-found To office
    expect(t4c.draft.copyTo).toContain("நகல்-அலுவலகம் (search)"); // search-found CC
    expect(f.calls.resolve).toBe(1); // resolved exactly once per letter
    expect(t4c.chunks.at(-1)).toContain("AI"); // spoken disclaimer, appended after the letter
    expect(assembleTextHasNoDisclaimer(t4c.draft)).toBe(true);
    expect(t4c.draft.bodyParagraphs.join()).toContain("திருட்டு");
    expect(f.drafts).toHaveLength(1);

    // The full Q&A is captured on the draft for the admin view: the citizen's answers
    // are paired with the questions Madal asked (not just the citizen's side).
    const answers = f.drafts[0]!.dialogue.map((t) => t.a);
    expect(answers).toContain("கடலூர்");
    expect(answers).toContain("நேத்து ராத்திரி");
    expect(f.drafts[0]!.dialogue.some((t) => t.q.length > 0)).toBe(true); // Madal's questions captured too

    // Claude token usage is metered per letter and snapshotted onto the draft (for cost).
    expect(f.drafts[0]!.usage.outputTokens).toBeGreaterThan(0);
    expect(f.drafts[0]!.usage.calls).toBeGreaterThan(0);

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

    // Turn 6 — voice approval: DELIVER the documents, log the approval, and WAIT for a
    // post-delivery review of the actual PDF. The session stays open (not cleared).
    const t6 = await orch.handleTurn(sid, "சரி அனுப்புங்க");
    expect(t6.kind).toBe("deliver");
    if (t6.kind !== "deliver") throw new Error("unreachable");
    expect(t6.revisions).toBe(1);
    expect(t6.draftHash).toMatch(/^[0-9a-f]{64}$/);
    expect(f.approvals).toEqual([{ draftId: "draft-2", approvalUtterance: "சரி அனுப்புங்க", revisions: 1 }]);
    expect(await orch.isNewSession(sid)).toBe(false); // still open — awaiting review

    // Turn 7 — the user reviewed the PDF and it's fine ("நன்றி") → we ask for one line of
    // feedback before closing. The session stays open to capture it.
    const t7 = await orch.handleTurn(sid, "நன்றி");
    expect(t7.kind).toBe("feedback_request");
    if (t7.kind !== "feedback_request") throw new Error("unreachable");
    expect(f.approvals).toHaveLength(2); // final definitive approval also logged
    expect(await orch.isNewSession(sid)).toBe(false); // still open — awaiting feedback

    // Turn 8 — the feedback line is captured (sentiment/rating derived), then CLOSED.
    const t8 = await orch.handleTurn(sid, "ரொம்ப நல்லா இருந்துச்சு, உதவியா இருந்துச்சு");
    expect(t8.kind).toBe("closed");
    if (t8.kind !== "closed") throw new Error("unreachable");
    expect(f.feedback).toHaveLength(1);
    expect(f.feedback[0]!.sentiment).toBe("positive");
    expect(f.feedback[0]!.categoryKey).toBeNull(); // generic path — no category
    expect(f.feedback[0]!.text).toContain("நல்லா");
    expect(await orch.isNewSession(sid)).toBe(true);
  });

  it("post-delivery correction: redo and re-deliver, then close on the next OK", async () => {
    const f = makeFakeDeps("generic_petition", null);
    const orch = createLettersOrchestrator(f.deps);
    const sid = "postfix";
    f.queueExtract({ sender_name: "லட்சுமி", sender_address: "கடலூர்", incident_details: "வீட்டுல கஷ்டம்", addressee_office: "வட்டாட்சியர் அலுவலகம்" });
    await orch.handleTurn(sid, "வட்டாட்சியருக்கு மனு, என் பேரு லட்சுமி, வீட்டுல கஷ்டம்");
    await orch.handleTurn(sid, "ஆம்"); // → copy_to question
    await orch.handleTurn(sid, "வேண்டாம்"); // → readback
    const deliver1 = await orch.handleTurn(sid, "சரி"); // voice approve → deliver
    expect(deliver1.kind).toBe("deliver");
    const draftsAfterFirst = f.drafts.length;

    // The user reads the PDF and wants a change → redo + re-deliver, still awaiting review.
    f.queueExtract({});
    const deliver2 = await orch.handleTurn(sid, "பேரை லட்சுமி பாய் னு மாத்துங்க");
    expect(deliver2.kind).toBe("deliver");
    if (deliver2.kind !== "deliver") throw new Error("unreachable");
    expect(deliver2.revisions).toBe(1);
    expect(f.drafts.length).toBe(draftsAfterFirst + 1); // a new revision was drafted
    expect(await orch.isNewSession(sid)).toBe(false);

    // No more changes → ask for feedback, then close on the feedback line.
    const fb = await orch.handleTurn(sid, "சரி");
    expect(fb.kind).toBe("feedback_request");
    const closed = await orch.handleTurn(sid, "நல்லா இருந்துச்சு");
    expect(closed.kind).toBe("closed");
    expect(f.feedback).toHaveLength(1);
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

  it("copy question: 'தெரியலை' → searched CC; later 'நகல் வேண்டாம்' at read-back removes it", async () => {
    const f = makeFakeDeps("generic_petition", null);
    const orch = createLettersOrchestrator(f.deps);
    const sid = "cc";
    f.queueExtract({ sender_name: "லட்சுமி", sender_address: "கடலூர்", incident_details: "வீட்டுல கஷ்டம்" });
    await orch.handleTurn(sid, "மனு எழுதணும், என் பேரு லட்சுமி, வீட்டுல கஷ்டம்");
    const q1 = await orch.handleTurn(sid, "ஆம்");
    if (q1.kind !== "question") throw new Error(`expected question, got ${q1.kind}`);
    expect(q1.fact).toBe("addressee_office");
    const q2 = await orch.handleTurn(sid, "தெரியலை");
    if (q2.kind !== "question") throw new Error(`expected question, got ${q2.kind}`);
    expect(q2.fact).toBe("copy_to");
    const rb = await orch.handleTurn(sid, "தெரியலை");
    if (rb.kind !== "readback") throw new Error(`expected readback, got ${rb.kind}`);
    expect(rb.draft.copyTo).toContain("நகல்-அலுவலகம்"); // CC searched because user said don't-know

    f.queueExtract({});
    const r = await orch.handleTurn(sid, "நகல் வேண்டாம்");
    if (r.kind !== "readback") throw new Error(`expected readback, got ${r.kind}`);
    expect(r.draft.copyTo).toBeNull();
    expect(r.chunks.join()).toContain("நீக்கிவிட்டேன்"); // removal acknowledged, not "no change"
  });

  it("category entities: asked after the story, captured VERBATIM (no LLM), 'தெரியலை' skips, woven via req.entities", async () => {
    const f = makeFakeDeps("generic_petition");
    const seen: Array<Record<string, string> | undefined> = [];
    const orch = createLettersOrchestrator({
      ...f.deps,
      getCategoryEntities: async (categoryId) => (categoryId === "test_category" ? ["survey_number", "village"] : []),
      draft: async (type, facts, req) => {
        seen.push(req.entities);
        return f.deps.draft(type, facts, req);
      },
    });
    const sid = "ent";
    f.queueExtract({ sender_name: "முருகன்", sender_address: "கடலூர்", incident_details: "பட்டா மாறலை", addressee_office: "வட்டாட்சியர் அலுவலகம்" });
    await orch.handleTurn(sid, "பட்டா மாத்தி தரலை, வட்டாட்சியர் அலுவலகத்துக்கு கடிதம் எழுதணும், நான் முருகன்");
    const extractCallsBefore = f.calls.extract.length;

    // After "ஆம்": story facts complete → FIRST entity question (before addressee/copy).
    const e1 = await orch.handleTurn(sid, "ஆம்");
    if (e1.kind !== "entity_question") throw new Error(`expected entity_question, got ${e1.kind}`);
    expect(e1.entity).toBe("survey_number");

    // Verbatim capture — the answer triggers NO extraction call.
    const e2 = await orch.handleTurn(sid, "214/2B");
    if (e2.kind !== "entity_question") throw new Error(`expected entity_question, got ${e2.kind}`);
    expect(e2.entity).toBe("village");
    expect(f.calls.extract.length).toBe(extractCallsBefore);

    // "தெரியலை" skips the entity; a category matched, so the addressee + copy questions are
    // NOT asked (its chain provides To/CC) — the flow goes straight to the read-back.
    const rb = await orch.handleTurn(sid, "தெரியலை");
    if (rb.kind !== "readback") throw new Error(`expected readback, got ${rb.kind}`);
    expect(seen.at(-1)).toEqual({ survey_number: "214/2B" }); // entities reached the drafter
  });

  it("language choice (askLanguage): after confirm, asks Tamil/English; the pick sets the draft language", async () => {
    const f = makeFakeDeps("generic_petition", null);
    const orch = createLettersOrchestrator({ ...f.deps, askLanguage: true });
    const sid = "lang";
    f.queueExtract({ sender_name: "லட்சுமி", sender_address: "கடலூர்", incident_details: "வீட்டுல கஷ்டம்", addressee_office: "வட்டாட்சியர்" });
    await orch.handleTurn(sid, "மனு எழுதணும், நான் லட்சுமி, வீட்டுல கஷ்டம்");
    // "ஆம்" confirms the type → now the language is asked (not the first gap fact).
    const lang = await orch.handleTurn(sid, "ஆம்");
    expect(lang.kind).toBe("language_choice");
    // Tapping "English" (button id "en") sets the letter language; flow proceeds.
    const after = await orch.handleTurn(sid, "en");
    expect(after.kind).toBe("question"); // now the gap loop starts (copy_to left)
    // Decline the copy → read-back; the draft is in English.
    const rb = await orch.handleTurn(sid, "வேண்டாம்");
    if (rb.kind !== "readback") throw new Error(`expected readback, got ${rb.kind}`);
    expect(rb.draft.language).toBe("en");
  });

  it("direct-deliver (skipReadback): once details are in, the PDF is delivered — no read-back", async () => {
    const f = makeFakeDeps("generic_petition", "drainage_sewage");
    const orch = createLettersOrchestrator({ ...f.deps, skipReadback: true });
    const sid = "direct";
    f.queueExtract({ sender_name: "லட்சுமி", sender_address: "கடலூர்", incident_details: "சாக்கடை" });
    await orch.handleTurn(sid, "சாக்கடை பிரச்சனை, மனு எழுதணும், நான் லட்சுமி, கடலூர்");
    const r = await orch.handleTurn(sid, "ஆம்"); // confirm → straight to DELIVER (no readback)
    expect(r.kind).toBe("deliver");
    // The post-delivery review is still the checkpoint: "okay" → approval + feedback.
    const fb = await orch.handleTurn(sid, "சரி");
    expect(fb.kind).toBe("feedback_request");
    expect(f.approvals).toHaveLength(1); // delivered-then-approved
  });

  it("category found: addressee + copy questions are SKIPPED (To/CC come from its chain)", async () => {
    const f = makeFakeDeps("generic_petition", "drainage_sewage");
    const orch = createLettersOrchestrator(f.deps);
    const sid = "cat";
    // Story facts complete in one go — no addressee/copy stated by the citizen.
    f.queueExtract({ sender_name: "லட்சுமி", sender_address: "கடலூர்", incident_place: "தெரு", incident_details: "சாக்கடை" });
    await orch.handleTurn(sid, "சாக்கடை பிரச்சனை, மனு எழுதணும், நான் லட்சுமி, கடலூர்");
    const rb = await orch.handleTurn(sid, "ஆம்");
    // Went straight to the read-back — the citizen was NEVER asked who to send it to / copy.
    expect(rb.kind).toBe("readback");
    if (rb.kind !== "readback") throw new Error("unreachable");
    expect(f.calls.resolve).toBe(1); // To/CC resolved once, from the category chain
    expect(rb.draft.addresseeBlock).toBe("தேடல்-அலுவலகம்"); // filled from the category, not asked
  });

  it("copy question: 'வேண்டாம்' means NO copy — nothing searched, நகல் line absent", async () => {
    const f = makeFakeDeps("generic_petition", null);
    const orch = createLettersOrchestrator(f.deps);
    const sid = "nocc";
    f.queueExtract({ sender_name: "லட்சுமி", sender_address: "கடலூர்", incident_details: "வீட்டுல கஷ்டம்", addressee_office: "வட்டாட்சியர் அலுவலகம்" });
    await orch.handleTurn(sid, "வட்டாட்சியருக்கு மனு எழுதணும், என் பேரு லட்சுமி, வீட்டுல கஷ்டம்");
    const q = await orch.handleTurn(sid, "ஆம்");
    if (q.kind !== "question") throw new Error(`expected question, got ${q.kind}`);
    expect(q.fact).toBe("copy_to");
    const rb = await orch.handleTurn(sid, "வேண்டாம்");
    if (rb.kind !== "readback") throw new Error(`expected readback, got ${rb.kind}`);
    expect(rb.draft.copyTo).toBeNull(); // declined — no CC of any kind
    expect(rb.draft.addresseeBlock).toBe("வட்டாட்சியர் அலுவலகம்"); // user-stated To used as given
    expect(f.calls.resolve).toBe(0); // and NO web search ran at all
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
