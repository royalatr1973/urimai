import { describe, it, expect } from "vitest";
import type { Verdict } from "@urimai/types";
import { buildResultsSummaryTamil } from "../src/reply.js";

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

  it("always closes with the help pointer", () => {
    const summary = buildResultsSummaryTamil([V("widow", "eligible")], NAMES);
    expect(summary).toContain("'உதவி' என்று சொல்லுங்கள்");
  });
});
