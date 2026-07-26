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
    .replace(/[.,!?;:"'()\-—]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Read-back reply classification. Live testing (July 2026) showed exact-match approval
 * is hopeless against real speech ("ஓகே கடிதம் குடுங்க", "சரி அனுப்புங்கள்" — every
 * natural yes was falling through to the correction path, looping the confirmation
 * forever). The rules, in precedence order:
 *
 *  1. Positive idioms ("மாற்றம் இல்லை", "no change") → approve, checked FIRST because
 *     they contain negative words.
 *  2. Correction verbs (மாத்து/மாற்று/திருத்து/சேர்/நீக்கு/change/add/...) → correction.
 *  3. Negatives without a stated change ("இல்லை", "வேண்டாம்", bare "no") → unclear —
 *     the user rejected the draft but gave nothing to act on; ask, don't guess.
 *  4. An approval TOKEN (சரி, ஓகே, அனுப்புங்க, குடுங்க, ...) in a SHORT reply (≤4
 *     tokens) → approve. Token-level, not substring: "சரியா?" must not approve.
 *     Long replies containing an approval word are unclear, never silent approval —
 *     a false approval sends a wrong letter; a clarifying question costs one turn.
 *  5. Everything else → unclear → clarifying question (no re-draft, no revision burnt).
 */
export type ReviewReply = "approve" | "correction" | "unclear";

const POSITIVE_IDIOMS = [
  "மாற்றம் இல்லை",
  "மாற்றம் எதுவும் இல்லை",
  "மாத்த வேண்டாம்",
  "மாற்ற வேண்டாம்",
  "அப்படியே அனுப்பு",
  "இப்படியே அனுப்பு",
  "நல்லா இருக்கு",
  "நல்லாருக்கு",
  "பரவாயில்லை",
  "தப்பில்லை",
  "no change",
  "no changes",
  "nothing to change",
  "looks good",
  "its ok",
  "it is ok",
  "its fine",
  "it is fine",
];

const CORRECTION_MARKERS = [
  "மாத்த",
  "மாத்து",
  "மாற்ற",
  "மாற்று",
  "திருத்த",
  "திருத்து",
  "திருத்தம்",
  "சேர்",
  "சேத்து",
  "சேக்க",
  "நீக்க",
  "நீக்கு",
  "எடுத்துடு",
  "எழுது",
  "எழுதி", // "எழுதியிருக்கீங்க" — you wrote (it wrongly)
  "எழுதுங்க",
  "வேற",
  "change",
  "add ",
  "remove",
  "fix ",
  "wrong",
  "தப்பு",
  "தப்பா", // colloquial "wrongly"
  "தவறு",
  "தவறா",
];

const NEGATIVE_TOKENS = new Set(["இல்லை", "இல்ல", "illa", "வேண்டாம்", "vendam", "no", "not", "nope"]);

const APPROVE_TOKENS = new Set([
  "சரி",
  "சரிதான்",
  "சரிங்க",
  "ஆம்",
  "ஆம", // ASR sometimes drops the final pulli
  "ஆமா",
  "ஆமாம்",
  "ஆமாங்க",
  "ஓகே",
  "ஒகே",
  "ok",
  "okay",
  "oke",
  "yes",
  "es",
  "correct",
  "கரெக்ட்",
  "super",
  "சூப்பர்",
  "நல்லது",
  "போதும்",
  "நன்றி", // thanks — a natural "we're done" signal at post-delivery review
  "நன்றிங்க",
  "thanks",
  "thank",
  "அனுப்பு",
  "அனுப்புங்க",
  "அனுப்புங்கள்",
  "அனுப்பிடு",
  "அனுப்பிடுங்க",
  "அனுப்பலாம்",
  "குடு",
  "குடுங்க",
  "கொடு",
  "கொடுங்க",
  "கொடுங்கள்",
  "send",
  "give",
  "approve",
  "approved",
  "finalize",
]);

export function classifyReviewReply(text: string): ReviewReply {
  const t = normalize(text);
  if (!t) return "unclear";

  if (POSITIVE_IDIOMS.some((p) => t.includes(p))) return "approve";
  if (CORRECTION_MARKERS.some((m) => t.includes(m))) return "correction";

  const tokens = t.split(" ");
  if (tokens.some((tok) => NEGATIVE_TOKENS.has(tok))) return "unclear";
  if (tokens.length <= 4 && tokens.some((tok) => APPROVE_TOKENS.has(tok))) return "approve";
  return "unclear";
}

/** Back-compat: true only for a clear approval. */
export function isApproval(text: string): boolean {
  return classifyReviewReply(text) === "approve";
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

/**
 * "Not needed" — a whole-message decline of an offered extra (e.g. the நகல் copy).
 * Distinct from "தெரியலை": declining means NONE, don't-know means "find one for me".
 */
const NO_NEED = new Set(["வேண்டாம்", "வேணாம்", "இல்லை", "இல்ல", "தேவையில்லை", "தேவை இல்லை", "no", "not needed", "no need", "nope"]);

export function isNoNeed(text: string): boolean {
  return NO_NEED.has(normalize(text));
}

/**
 * Which letter language the citizen chose. Accepts the tappable button ids ("ta"/"en")
 * and spoken/typed words in Tamil or English. Null when it's neither (caller defaults).
 */
export function parseLanguageChoice(text: string): "ta" | "en" | null {
  const t = normalize(text);
  if (!t) return null;
  if (t === "ta" || /தமிழ|tamil/.test(t)) return "ta";
  if (t === "en" || /ஆங்கில|இங்கிலீஷ|இங்கிலிஷ|english|inglish/.test(t)) return "en";
  return null;
}
