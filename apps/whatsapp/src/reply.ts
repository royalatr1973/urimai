/**
 * Tamil reply text for the voice channel. Questions are spoken verbatim from the
 * orchestrator's bilingual question (question.ta). Results get a short spoken Tamil summary
 * that the TTS reads out; the document cards (images) accompany the eligible ones.
 */
import type { Profile, Verdict } from "@urimai/types";

export interface SchemeName {
  nameTamil: string;
}

const MARITAL_TA: Record<string, string> = {
  married: "திருமணமானவர்",
  widowed: "விதவை",
  single: "திருமணமாகாதவர்",
  divorced: "விவாகரத்தானவர்",
};

/**
 * Progress recap, spoken before every Nth question (curator feedback: after 4 answers the
 * conversation feels like an interrogation with no end in sight). Three beats: what Urimai
 * has understood so far, which schemes are closed vs still being checked, and a polite ask
 * for patience. The channel prepends this to the next question — one message, one voice note.
 */
export function buildProgressRecapTamil(
  profile: Profile,
  verdicts: Verdict[],
  namesById: Record<string, SchemeName>,
): string {
  const name = (id: string) => namesById[id]?.nameTamil ?? id;

  // What we know — only the headline facts, humanized. A full field dump would be a
  // longer listen than the questions it's apologizing for.
  const facts: string[] = [];
  if (profile.age != null) facts.push(`வயது ${profile.age}`);
  if (profile.marital_status && MARITAL_TA[profile.marital_status]) facts.push(MARITAL_TA[profile.marital_status]!);
  if (profile.is_tamil_nadu === true) facts.push("தமிழ்நாடு");
  if (profile.has_regular_income === false) facts.push("நிலையான வருமானம் இல்லை");
  if (profile.annual_family_income != null) facts.push(`குடும்ப ஆண்டு வருமானம் சுமார் ₹${profile.annual_family_income.toLocaleString("en-IN")}`);
  if (profile.is_bpl === true) facts.push("BPL குடும்பம்");
  if (profile.disability_percent != null && profile.disability_percent > 0) facts.push(`மாற்றுத்திறன் ${profile.disability_percent}%`);

  const open = verdicts.filter((v) => v.status === "need_info");
  const closed = verdicts.length - open.length;

  const parts: string[] = [];
  if (facts.length > 0) parts.push(`இதுவரை நான் அறிந்தது: ${facts.join(", ")}.`);
  if (closed > 0) parts.push(`${closed} திட்டங்களுக்கான முடிவு வந்துவிட்டது.`);
  if (open.length > 0) {
    parts.push(`இப்போது ${open.map((v) => name(v.schemeId)).join(", ")} திட்டத்திற்கான தகுதியை சரிபார்க்கிறேன்.`);
  }
  parts.push("இன்னும் சில கேள்விகள்தான் — தயவுசெய்து பொறுமையாக பதில் சொல்லுங்கள்.");
  return parts.join(" ");
}

/** A concise spoken-Tamil summary of the verdicts. */
export function buildResultsSummaryTamil(
  verdicts: Verdict[],
  namesById: Record<string, SchemeName>,
): string {
  const name = (id: string) => namesById[id]?.nameTamil ?? id;
  const eligible = verdicts.filter((v) => v.status === "eligible");
  const notEligible = verdicts.filter((v) => v.status === "not_eligible");

  const parts: string[] = [];
  if (eligible.length > 0) {
    // HEDGE: not "you qualify" — "appears you may qualify" + "final decision is the officer's".
    // False positives are the harmful direction (a citizen traveling to a VAO for nothing),
    // so we soften the positive verdict and locate the authority every time.
    parts.push(
      `நீங்கள் ${eligible.map((v) => name(v.schemeId)).join(", ")} திட்டத்திற்கு தகுதி பெறக்கூடும் என்று தோன்றுகிறது. இறுதி முடிவு அரசு அதிகாரிதான் எடுப்பார்.`,
    );
    parts.push("தேவையான ஆவணங்களை படத்தில் காட்டியுள்ளேன்.");
    // ONE-PENSION-AT-A-TIME rule: a citizen may draw only one social security pension.
    // Fire the hint only when 2+ schemes come back eligible — no need to nag when there's
    // only one option anyway.
    if (eligible.length >= 2) {
      parts.push(
        "பொதுவாக, ஒரு நேரத்தில் ஒரே ஓய்வூதியம் மட்டுமே பெற முடியும். உங்களுக்கு பொருத்தமான திட்டத்தை தேர்ந்தெடுக்க அரசு அதிகாரியிடம் ஆலோசிக்கவும்.",
      );
    }
  } else {
    parts.push("தற்போதைய தகவலின் படி, நீங்கள் எந்த திட்டத்திற்கும் தகுதி பெறவில்லை.");
  }
  if (notEligible.length > 0) {
    parts.push(`${notEligible.map((v) => name(v.schemeId)).join(", ")} திட்டத்திற்கு தகுதி இல்லை.`);
  }
  // Action close (curator decision): when at least one scheme looks eligible, point to the
  // e-Sevai centre for actual processing. No "say help" pointer — no operator service is
  // staffed, so none is promised.
  if (eligible.length > 0) {
    parts.push("மேல் நடவடிக்கைக்கு உங்கள் அருகிலுள்ள இ-சேவை மையத்திற்குச் செல்லுங்கள்.");
  }
  return parts.join(" ");
}
