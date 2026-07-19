/**
 * Small deterministic intent detectors for the letters flow. Conservative on purpose:
 * approval must be an unambiguous whole-message yes (§2.1 — the approval utterance is
 * logged as the user's explicit sign-off); anything else in the read-back phase is
 * treated as a correction, which is always safe (worst case: one more read-back).
 */

const normalize = (t: string) =>
  (t ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.,!?்]*$/u, "")
    .replace(/\s+/g, " ");

/** Whole-message approval of the read-back draft. */
const APPROVE_EXACT = new Set([
  "ஆம்",
  "ஆமா",
  "ஆமாம்",
  "சரி",
  "சரிதான்",
  "சரி அனுப்பு",
  "சரி அனுப்புங்க",
  "அனுப்பு",
  "அனுப்புங்க",
  "இப்படியே அனுப்பு",
  "இப்படியே அனுப்புங்க",
  "நல்லா இருக்கு",
  "ஓகே",
  "ok",
  "okay",
  "yes",
  "correct",
  "approve",
  "approved",
  "send",
  "send it",
]);

export function isApproval(text: string): boolean {
  return APPROVE_EXACT.has(normalize(text));
}

/** Whole-message yes — for the type-confirmation question. */
const YES_EXACT = new Set(["ஆம்", "ஆமா", "ஆமாம்", "சரி", "சரிதான்", "ஓகே", "yes", "ok", "okay", "correct", "ஆமாங்க"]);
/** Whole-message no — for the type-confirmation question. */
const NO_EXACT = new Set(["இல்லை", "இல்ல", "வேண்டாம்", "no", "இல்லைங்க", "தப்பு", "wrong"]);

export function isYes(text: string): boolean {
  return YES_EXACT.has(normalize(text));
}
export function isNo(text: string): boolean {
  return NO_EXACT.has(normalize(text));
}

/** "I don't know" — acceptable for optional/addressee facts; renders a blank (§7.4). */
const DONT_KNOW = ["தெரியலை", "தெரியாது", "தெரியல", "தெரிஞ்சதில்லை", "don't know", "dont know", "no idea", "not sure", "தெரியவில்லை"];

export function isDontKnow(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  return DONT_KNOW.some((p) => t === p || t.includes(p));
}
