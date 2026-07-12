import { describe, it, expect } from "vitest";
import { EMPTY_PROFILE, type Profile, type Verdict } from "@urimai/types";
import { buildProgressRecapTamil, buildResultsSummaryTamil } from "../src/reply.js";

const V = (schemeId: string, status: Verdict["status"]): Verdict => ({
  schemeId,
  status,
  reasons: [],
  missingFields: [],
  ruleVersion: 1,
});

const NAMES = {
  widow: { nameTamil: "ஆதரவற்ற விதவை ஓய்வூதியம்" },
  oldage: { nameTamil: "முதியோர் ஓய்வூதியம்" },
  kmut: { nameTamil: "கலைஞர் மகளிர் உரிமைத் தொகை" },
  disabled: { nameTamil: "மாற்றுத்திறனாளி ஓய்வூதியம்" },
};

describe("verdict hedge — appears may qualify, not you qualify", () => {
  it("uses the hedged phrasing when at least one scheme is eligible", () => {
    const summary = buildResultsSummaryTamil([V("widow", "eligible")], NAMES);
    // Hedged Tamil: "தகுதி பெறக்கூடும் என்று தோன்றுகிறது" = "appears you may qualify"
    expect(summary).toContain("தகுதி பெறக்கூடும் என்று தோன்றுகிறது");
    // Locates the authority every eligible-verdict message.
    expect(summary).toContain("இறுதி முடிவு அரசு அதிகாரிதான்");
    // Explicitly does NOT use the old hard "you qualify" phrasing.
    expect(summary).not.toContain("தகுதி பெறுகிறீர்கள்");
  });

  it("keeps the not-eligible line clear (unhedged) — false negatives are safely correctable", () => {
    const summary = buildResultsSummaryTamil(
      [V("widow", "not_eligible"), V("kmut", "not_eligible")],
      NAMES,
    );
    expect(summary).toContain("எந்த திட்டத்திற்கும் தகுதி பெறவில்லை");
    // No hedge word on the negative side.
    expect(summary).not.toContain("தகுதி பெறக்கூடும்");
  });

  it("in mixed verdicts, only the eligible line carries the hedge and the officer clause", () => {
    const summary = buildResultsSummaryTamil(
      [V("widow", "eligible"), V("kmut", "not_eligible")],
      NAMES,
    );
    expect(summary).toContain("தகுதி பெறக்கூடும் என்று தோன்றுகிறது");
    expect(summary).toContain("அரசு அதிகாரிதான்");
    // The not-eligible scheme's name still appears in the "not eligible" clause.
    expect(summary).toContain("கலைஞர் மகளிர் உரிமைத் தொகை");
    expect(summary).toContain("தகுதி இல்லை");
  });

  it("eligible results close with the e-Sevai direction, and the operator promise is gone", () => {
    const summary = buildResultsSummaryTamil([V("widow", "eligible")], NAMES);
    expect(summary).toContain("இ-சேவை மையத்திற்குச் செல்லுங்கள்");
    // No staffed operator service — the old "say 'help'" pointer must not appear.
    expect(summary).not.toContain("'உதவி' என்று சொல்லுங்கள்");
  });

  it("not-eligible-only results carry no e-Sevai direction and no help pointer", () => {
    const summary = buildResultsSummaryTamil([V("widow", "not_eligible")], NAMES);
    expect(summary).not.toContain("இ-சேவை மையத்திற்குச்");
    expect(summary).not.toContain("'உதவி' என்று சொல்லுங்கள்");
  });
});

describe("progress recap (every 4 answered questions)", () => {
  const profile: Profile = {
    ...EMPTY_PROFILE,
    age: 65,
    marital_status: "married",
    is_tamil_nadu: true,
    has_regular_income: false,
    annual_family_income: 25000,
  };

  it("recaps known facts, closed-scheme count, still-open schemes, and asks for patience", () => {
    const recap = buildProgressRecapTamil(
      profile,
      [V("widow", "not_eligible"), V("oldage", "not_eligible"), V("kmut", "need_info"), V("disabled", "need_info")],
      NAMES,
    );
    expect(recap).toContain("இதுவரை நான் அறிந்தது");
    expect(recap).toContain("வயது 65");
    expect(recap).toContain("திருமணமானவர்");
    expect(recap).toContain("₹25,000");
    expect(recap).toContain("2 திட்டங்களுக்கான முடிவு");
    expect(recap).toContain("கலைஞர் மகளிர் உரிமைத் தொகை"); // still-open scheme, by name
    expect(recap).toContain("பொறுமையாக"); // the cooperation ask
  });

  it("stays sensible with an empty profile (no 'so far I know:' with nothing after it)", () => {
    const recap = buildProgressRecapTamil(EMPTY_PROFILE, [V("kmut", "need_info")], NAMES);
    expect(recap).not.toContain("இதுவரை நான் அறிந்தது");
    expect(recap).toContain("பொறுமையாக");
  });
});
