/**
 * The bait tests (LETTERS_BRIEF Phase 3 acceptance): a fact absent from input must
 * never appear in the final body. The guard is deterministic, so the bait is a mocked
 * model that TRIES to smuggle inventions in — the guard must catch every one.
 */
import { describe, it, expect } from "vitest";
import { checkBodyAgainstFacts } from "../src/guard.js";
import { draftLetter, type DrafterClient } from "../src/draft.js";
import { FACTS, POLICE_TYPE } from "./fixtures.js";

const reply = (text: string): DrafterClient => ({
  messages: { create: async () => ({ content: [{ type: "text", text }] }) },
});

describe("checkBodyAgainstFacts", () => {
  it("accepts a body whose numbers all come from facts", () => {
    const v = checkBodyAgainstFacts(["18-07-2026 அன்று 8000 ரூபா திருடு போச்சு."], FACTS);
    expect(v.ok).toBe(true);
  });

  it("rejects an invented number (an FIR number the user never gave)", () => {
    const v = checkBodyAgainstFacts(["FIR எண் 99887 பதிவு செய்யப்பட்டது."], FACTS);
    expect(v.ok).toBe(false);
    expect(v.violations.join()).toContain("99887");
  });

  it("rejects legal citations in every disguise — those come only from the LetterType record", () => {
    for (const bait of [
      "As per Section 154 of the CrPC, an FIR must be registered.",
      "தகவல் அறியும் உரிமைச் சட்டம் 2005 படி கேட்கிறேன்.",
      "Under the Payment of Wages Act, 1936 this is due.",
      "பிரிவு 154 இன் கீழ் புகார்.",
    ]) {
      expect(checkBodyAgainstFacts([bait], FACTS).ok, bait).toBe(false);
    }
  });

  it("allows single digits (counts like '2 chains') without a fact match", () => {
    expect(checkBodyAgainstFacts(["2 தங்க செயின் திருடு போச்சு."], FACTS).ok).toBe(true);
  });
});

describe("draftLetter end-to-end bait", () => {
  it("a model that invents an FIR number is overruled — the invention never reaches the letter", async () => {
    const bait = reply('{"bodyParagraphs":["என் வீட்டில் திருட்டு நடந்தது.","FIR எண் 4471/2026 ஏற்கனவே பதிவாகியுள்ளது."]}');
    const { draft, bodySource, violations } = await draftLetter(POLICE_TYPE, FACTS, { client: bait, date: "19-07-2026" });
    expect(bodySource).toBe("fallback");
    expect(violations.length).toBeGreaterThan(0);
    expect(draft.bodyParagraphs.join()).not.toContain("4471");
    // The fallback still carries the user's own words.
    expect(draft.bodyParagraphs.join()).toContain("தங்க செயின்");
  });

  it("a model that cites a statute is overruled the same way", async () => {
    const bait = reply('{"bodyParagraphs":["Section 379 IPC திருட்டு குற்றம் ஆகும்."]}');
    const { bodySource, draft } = await draftLetter(POLICE_TYPE, FACTS, { client: bait, date: "19-07-2026" });
    expect(bodySource).toBe("fallback");
    expect(draft.bodyParagraphs.join()).not.toContain("379");
  });

  it("a clean, facts-grounded body passes through as the LLM wrote it", async () => {
    const clean = reply('{"bodyParagraphs":["18-07-2026 அன்று எங்க வீட்டில் திருட்டு நடந்தது. தங்க செயின் ரெண்டும் எட்டாயிரம் ரூபா பணமும் போனது."]}');
    const { bodySource, draft } = await draftLetter(POLICE_TYPE, FACTS, { client: clean, date: "19-07-2026" });
    expect(bodySource).toBe("llm");
    expect(draft.bodyParagraphs[0]).toContain("திருட்டு");
  });
});

describe("resilience", () => {
  it("API failure and junk output degrade to the deterministic fallback body, never a crash", async () => {
    const down: DrafterClient = { messages: { create: async () => { throw new Error("down"); } } };
    const r1 = await draftLetter(POLICE_TYPE, FACTS, { client: down, date: "19-07-2026" });
    expect(r1.bodySource).toBe("fallback");
    expect(r1.draft.bodyParagraphs.length).toBeGreaterThan(0);

    const r2 = await draftLetter(POLICE_TYPE, FACTS, { client: reply("I cannot help with that"), date: "19-07-2026" });
    expect(r2.bodySource).toBe("fallback");
    expect(r2.draft.bodyParagraphs.join()).toContain("திருடு");
  });
});
