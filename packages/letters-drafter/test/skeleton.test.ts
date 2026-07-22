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
    expect(draft.salutation).toContain("மதிப்பிற்குரிய"); // polite register (live-tester feedback)
    expect(draft.signatureLine).toContain("முருகன்");
    expect(draft.signatureLine).toContain("பெருவிரல்"); // thumb-impression wording
    expect(draft.copyTo).toBeNull(); // CC only when the user names someone
    // The AI disclaimer is spoken by the channel, never printed — no field on the draft.
    expect("disclaimer" in draft).toBe(false);
  });

  it("uses the model's SPECIFIC generated subject (not the generic type name)", async () => {
    const withSubject = reply(
      '{"subject":"வீட்டில் தங்க நகை திருட்டு குறித்து புகார்","bodyParagraphs":["எங்க வீட்டில் திருட்டு நடந்தது."]}',
    );
    const { draft } = await draftLetter(POLICE_TYPE, FACTS, { client: withSubject, date: "19-07-2026" });
    expect(draft.subject).toBe("வீட்டில் தங்க நகை திருட்டு குறித்து புகார்");
    expect(draft.subject).not.toBe(POLICE_TYPE.nameTamil); // no longer the generic label
  });

  it("the user's own stated subject beats the model's generated one", async () => {
    const withSubject = reply('{"subject":"திருட்டு புகார்","bodyParagraphs":["திருட்டு நடந்தது."]}');
    const { draft } = await draftLetter(
      POLICE_TYPE,
      { ...FACTS, subject: "என் சொந்த தலைப்பு" },
      { client: withSubject, date: "19-07-2026" },
    );
    expect(draft.subject).toBe("என் சொந்த தலைப்பு");
  });

  it("a generated subject that smuggles a citation is rejected — falls back to the type name", async () => {
    const bait = reply('{"subject":"Section 379 IPC திருட்டு","bodyParagraphs":["திருட்டு நடந்தது."]}');
    const { draft } = await draftLetter(POLICE_TYPE, FACTS, { client: bait, date: "19-07-2026" });
    expect(draft.subject).toBe(POLICE_TYPE.nameTamil); // citation-bearing subject dropped
  });

  it("RTI: the record's citation is appended to the generated subject", async () => {
    const withSubject = reply('{"subject":"ஓய்வூதிய விண்ணப்ப நிலை குறித்து","bodyParagraphs":["விவரம் தேவை."]}');
    const { draft } = await draftLetter(RTI_TYPE, FACTS, { client: withSubject, date: "19-07-2026" });
    expect(draft.subject).toBe("ஓய்வூதிய விண்ணப்ப நிலை குறித்து — Right to Information Act, 2005 — Section 6(1)");
  });

  it("renders a copy-to line from the user's own words", async () => {
    const { draft } = await draftLetter(
      POLICE_TYPE,
      { ...FACTS, copy_to: "மாவட்ட காவல் கண்காணிப்பாளர் அலுவலகம்" },
      { client: okBody, date: "19-07-2026" },
    );
    expect(draft.copyTo).toBe("மாவட்ட காவல் கண்காணிப்பாளர் அலுவலகம்");
  });

  it("directory To-office fills the addressee when the user named none; user facts still win", async () => {
    const dgp = {
      id: "tn_dgp",
      designation: "The DGP",
      designationTamil: "காவல்துறை தலைமை இயக்குநர், தமிழ்நாடு",
      department: "Home",
      addressLines: ["Dr. Radhakrishnan Salai, Mylapore", "Chennai"],
      pincode: "600004",
      phone: null,
      email: null,
      level: "state",
      district: null,
      handles: ["police_complaint"],
      ccFor: [],
      version: 1,
      source: "https://tn.gov.in",
      verified: false,
      notes: "",
    };
    const viaDirectory = await draftLetter(POLICE_TYPE, FACTS, { client: okBody, date: "19-07-2026", toOffice: dgp });
    expect(viaDirectory.draft.addresseeBlock).toBe("காவல்துறை தலைமை இயக்குநர், தமிழ்நாடு\nDr. Radhakrishnan Salai, Mylapore\nChennai - 600004");

    const userSaid = await draftLetter(
      POLICE_TYPE,
      { ...FACTS, addressee_office: "கடலூர் நகர காவல் நிலையம்" },
      { client: okBody, date: "19-07-2026", toOffice: dgp },
    );
    expect(userSaid.draft.addresseeBlock).toBe("கடலூர் நகர காவல் நிலையம்"); // user wins

    const cc = await draftLetter(POLICE_TYPE, { ...FACTS, copy_to: "வார்டு உறுப்பினர்" }, { client: okBody, date: "19-07-2026", ccOffices: [dgp] });
    expect(cc.draft.copyTo).toBe("வார்டு உறுப்பினர்\nகாவல்துறை தலைமை இயக்குநர், தமிழ்நாடு, Dr. Radhakrishnan Salai, Mylapore, Chennai - 600004");
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
