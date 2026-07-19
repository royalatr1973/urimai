/**
 * Read-back reply classification — born from live testing (July 2026), where every
 * natural spoken "yes" fell through exact-matching into the correction path and the
 * confirmation looped forever. The invariants:
 *  - natural approvals approve;
 *  - anything stating a change corrects;
 *  - anything ambiguous asks — NEVER silently approves, NEVER silently re-drafts.
 */
import { describe, it, expect } from "vitest";
import { classifyReviewReply } from "../src/intents.js";

describe("classifyReviewReply — approvals", () => {
  it("accepts the natural spoken yeses that looped in live testing", () => {
    for (const t of [
      "சரி அனுப்புங்க",
      "சரி அனுப்புங்கள்", // formal suffix from ASR
      "ஓகே கடிதம் குடுங்க",
      "ok கடிதம் கொடுங்க",
      "சரி.",
      "ஆம்",
      "ஆமா சரிதான்",
      "நல்லா இருக்கு",
      "இப்படியே அனுப்பு",
      "okay send",
      "yes",
      "சூப்பர் அனுப்பிடுங்க",
    ]) {
      expect(classifyReviewReply(t), t).toBe("approve");
    }
  });

  it("positive idioms with negative words inside still approve", () => {
    for (const t of ["மாற்றம் எதுவும் இல்லை", "மாத்த வேண்டாம் அனுப்பு", "பரவாயில்லை", "no changes"]) {
      expect(classifyReviewReply(t), t).toBe("approve");
    }
  });
});

describe("classifyReviewReply — corrections", () => {
  it("routes stated changes to the correction path, even when they contain 'சரி'", () => {
    for (const t of [
      "தேதி மாத்து",
      "சரி ஆனா தேதியை மாத்துங்க",
      "பேர தப்பா எழுதியிருக்கீங்க",
      "இன்னும் கொஞ்சம் விளக்கமா எழுதுங்க",
      "அந்த வரியை நீக்குங்க",
      "change the date",
      "add my phone number",
      "முகவரி வேற மாதிரி இருக்கணும்",
    ]) {
      expect(classifyReviewReply(t), t).toBe("correction");
    }
  });
});

describe("classifyReviewReply — unclear asks, never guesses", () => {
  it("a bare rejection with nothing to act on is unclear (ask what to change)", () => {
    for (const t of ["இல்லை", "வேண்டாம்", "no"]) {
      expect(classifyReviewReply(t), t).toBe("unclear");
    }
  });

  it("long replies containing an approval word do NOT silently approve", () => {
    // "put the date as the 18th, okay?" — approving this would send a wrong letter.
    expect(classifyReviewReply("சரி தேதி பதினெட்டு தேதின்னு வை")).not.toBe("approve");
  });

  it("questions and mumbles are unclear", () => {
    for (const t of ["சரியா?", "ம்ம்", "வணக்கம்", ""]) {
      expect(classifyReviewReply(t), t).not.toBe("approve");
      expect(classifyReviewReply(t), t).not.toBe("correction");
    }
  });
});
