import { describe, it, expect } from "vitest";
import { draftLetter } from "../src/draft.js";
import type { DrafterClient } from "../src/draft.js";
import { BLANK, buildAddresseeBlock, buildSubject, stripCuratorMarkers } from "../src/skeleton.js";
import { FACTS, POLICE_TYPE, RTI_TYPE } from "./fixtures.js";

const reply = (text: string): DrafterClient => ({
  messages: { create: async () => ({ content: [{ type: "text", text }] }) },
});
const okBody = reply('{"bodyParagraphs":["தங்க செயின் ரெண்டும் எட்டாயிரம் ரூபா பணமும் திருடு போச்சு."]}');

describe("deterministic skeleton", () => {
  it("assembles sender, date, addressee, subject, salutation, signature without the LLM's involvement", async () => {
    const { draft } = await draftLetter(POLICE_TYPE, FACTS, { client: okBody, date: "19-07-2026" });
    expect(draft.senderBlock).toBe("முருகன்\nகடலூர் பழைய பஸ் ஸ்டாண்ட் பக்கம்");
    expect(draft.date).toBe("19-07-2026");
    expect(draft.subject).toBe(POLICE_TYPE.nameTamil); // no user subject → type name; no refs → no citation
    expect(draft.salutation).toBe("ஐயா / அம்மையீர்,");
    expect(draft.signatureLine).toContain("முருகன்");
    expect(draft.signatureLine).toContain("பெருவிரல்"); // thumb-impression wording
  });

  it("falls back to the addresseeHint (curator markers stripped) when the user knew no addressee", () => {
    const block = buildAddresseeBlock(POLICE_TYPE, FACTS);
    expect(block).toContain("Station House Officer");
    expect(block).not.toContain("UNVERIFIED");
  });

  it("uses stated addressee facts over the hint", () => {
    const block = buildAddresseeBlock(POLICE_TYPE, { ...FACTS, addressee_office: "கடலூர் நகர காவல் நிலையம்" });
    expect(block).toBe("கடலூர் நகர காவல் நிலையம்");
  });

  it("appends legal citations to the subject VERBATIM from the LetterType record only", () => {
    const subject = buildSubject(RTI_TYPE, { letterTypeId: null, language: null }, "ta");
    expect(subject).toBe("தகவல் அறியும் உரிமை விண்ணப்பம் — Right to Information Act, 2005 — Section 6(1)");
  });

  it("marks unknown sender name as a blank to fill by hand", async () => {
    const { draft } = await draftLetter(POLICE_TYPE, { letterTypeId: null, language: null }, { client: okBody, date: "19-07-2026" });
    expect(draft.senderBlock).toBe(BLANK);
    expect(draft.signatureLine).toContain(BLANK);
  });

  it("stripCuratorMarkers removes only the marker", () => {
    expect(stripCuratorMarkers("Labour Officer. (UNVERIFIED — confirm)")).toBe("Labour Officer.");
    expect(stripCuratorMarkers("Labour Officer (Salem district)")).toBe("Labour Officer (Salem district)");
  });
});
