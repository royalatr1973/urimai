/**
 * Number-word → digit normalization for ASR transcripts.
 *
 * Indian-language ASR (Sarvam, Bhashini) writes spoken numbers as WORDS —
 * "எழுபத்தைந்து" instead of "75", "seventy five" instead of "75". On a formal letter
 * a door/survey/pincode/phone number must be digits, so we convert number-word runs
 * back to digits deterministically (no LLM — fast, free, provider-independent).
 *
 * Design points:
 *  - Digit tokens already present pass through unchanged.
 *  - "ஒரு" (the article "a"/"an") is intentionally NOT treated as 1 — only "ஒன்று"/
 *    "ஒண்ணு" are the numeral one — so "ஒரு வீடு" ("a house") is never mangled to "1 வீடு".
 *  - A run of single-digit words ("ஏழு ஐந்து", "9 8 7 …") is concatenated as a digit
 *    string (the way people read out phone / door numbers), while tens/hundreds/
 *    thousands words accumulate arithmetically ("எழுபத்தைந்து"→75, "இருநூறு நாற்பத்தைந்து"→245).
 */

// --- English ------------------------------------------------------------------
const EN: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const EN_HUNDRED = new Set(["hundred"]);
const EN_THOUSAND = new Set(["thousand"]);
const EN_LAKH = new Set(["lakh", "lac"]);

// --- Tamil 0–20 (+ common colloquial) -----------------------------------------
const TA: Record<string, number> = {
  பூஜ்ஜியம்: 0, சைபர்: 0,
  ஒன்று: 1, ஒண்ணு: 1, // NOT ஒரு (the article "a")
  இரண்டு: 2, ரெண்டு: 2,
  மூன்று: 3, மூணு: 3,
  நான்கு: 4, நாலு: 4,
  ஐந்து: 5, அஞ்சு: 5,
  ஆறு: 6,
  ஏழு: 7,
  எட்டு: 8,
  ஒன்பது: 9, ஒம்பது: 9,
  பத்து: 10,
  பதினொன்று: 11, பன்னிரண்டு: 12, பன்னிரெண்டு: 12, பதிமூன்று: 13, பதின்மூன்று: 13,
  பதினான்கு: 14, பதினைந்து: 15, பதினாறு: 16, பதினேழு: 17, பதினெட்டு: 18,
  பத்தொன்பது: 19, பத்தொம்பது: 19,
  இருபது: 20,
};

// --- Tamil 21–89: composed from tens-stems + unit-suffixes (regular sandhi) ----
const TA_TENS: Record<number, string> = { 30: "முப்பது", 40: "நாற்பது", 50: "ஐம்பது", 60: "அறுபது", 70: "எழுபது", 80: "எண்பது" };
const TA_STEMS: Record<number, string> = { 20: "இருபத்", 30: "முப்பத்", 40: "நாற்பத்", 50: "ஐம்பத்", 60: "அறுபத்", 70: "எழுபத்", 80: "எண்பத்" };
const TA_SUFFIX: Record<number, string> = {
  1: "தொன்று", 2: "திரண்டு", 3: "துமூன்று", 4: "துநான்கு", 5: "தைந்து", 6: "தாறு", 7: "தேழு", 8: "தெட்டு", 9: "தொன்பது",
};
for (const [tens, word] of Object.entries(TA_TENS)) TA[word] = Number(tens);
for (const [tens, stem] of Object.entries(TA_STEMS)) {
  const t = Number(tens);
  for (const [unit, suf] of Object.entries(TA_SUFFIX)) TA[stem + suf] = t + Number(unit);
}

// --- Tamil 90–99 (irregular) --------------------------------------------------
TA["தொண்ணூறு"] = 90;
const TA_90: Record<number, string> = {
  1: "தொண்ணூற்றொன்று", 2: "தொண்ணூற்றிரண்டு", 3: "தொண்ணூற்றுமூன்று", 4: "தொண்ணூற்றுநான்கு", 5: "தொண்ணூற்றைந்து",
  6: "தொண்ணூற்றாறு", 7: "தொண்ணூற்றேழு", 8: "தொண்ணூற்றெட்டு", 9: "தொண்ணூற்றொன்பது",
};
for (const [unit, word] of Object.entries(TA_90)) TA[word] = 90 + Number(unit);

// --- Tamil hundreds / thousands (fused, direct values) ------------------------
const TA_HUNDREDS: Record<string, number> = {
  நூறு: 100, இருநூறு: 200, முந்நூறு: 300, முன்னூறு: 300, நானூறு: 400, நாநூறு: 400,
  ஐநூறு: 500, ஐந்நூறு: 500, அறுநூறு: 600, எழுநூறு: 700, எண்ணூறு: 800, தொள்ளாயிரம்: 900,
};
const TA_THOUSANDS: Record<string, number> = {
  ஆயிரம்: 1000, ஈராயிரம்: 2000, மூவாயிரம்: 3000, நாலாயிரம்: 4000, நாற்பதாயிரம்: 40000,
  ஐயாயிரம்: 5000, ஆறாயிரம்: 6000, ஏழாயிரம்: 7000, எட்டாயிரம்: 8000, ஒன்பதாயிரம்: 9000, பத்தாயிரம்: 10000,
};
const TA_HUNDRED_MULT = new Set(["நூறு"]); // as a multiplier after a number ("இரண்டு நூறு" = 200)
const TA_THOUSAND_MULT = new Set(["ஆயிரம்"]);
const TA_LAKH_MULT = new Set(["லட்சம்", "லட்ச", "லக்ஷம்"]);

interface Tok {
  value: number | null; // direct number value, or null if not a number word
  mult: 0 | 100 | 1000 | 100000; // multiplier kind (0 = not a multiplier)
  isUnit: boolean; // a bare 0–9 word (for digit-sequence detection)
}

const PUNCT = /[.,!?;:()"'৷।]/gu;

function classify(rawWord: string): Tok {
  const key = rawWord.replace(PUNCT, "");
  const lower = key.toLowerCase();
  if (key.length === 0) return { value: null, mult: 0, isUnit: false };

  if (EN_HUNDRED.has(lower) || TA_HUNDRED_MULT.has(key)) return { value: null, mult: 100, isUnit: false };
  if (EN_THOUSAND.has(lower) || TA_THOUSAND_MULT.has(key)) return { value: null, mult: 1000, isUnit: false };
  if (EN_LAKH.has(lower) || TA_LAKH_MULT.has(key)) return { value: null, mult: 100000, isUnit: false };

  const v =
    (lower in EN ? EN[lower] : undefined) ??
    (key in TA ? TA[key] : undefined) ??
    (key in TA_HUNDREDS ? TA_HUNDREDS[key] : undefined) ??
    (key in TA_THOUSANDS ? TA_THOUSANDS[key] : undefined);
  if (v === undefined) return { value: null, mult: 0, isUnit: false };
  return { value: v, mult: 0, isUnit: v >= 0 && v <= 9 };
}

/** Reduce a run of number tokens to a digit string. */
function runToDigits(run: Tok[]): string {
  // Digit sequence: several single-digit words in a row (phone / door read out).
  if (run.length > 1 && run.every((t) => t.isUnit)) {
    return run.map((t) => String(t.value)).join("");
  }
  let result = 0;
  let current = 0;
  for (const t of run) {
    if (t.mult === 100) current = Math.max(current, 1) * 100;
    else if (t.mult === 1000) {
      result += Math.max(current, 1) * 1000;
      current = 0;
    } else if (t.mult === 100000) {
      result += Math.max(current, 1) * 100000;
      current = 0;
    } else if (t.value !== null) {
      current += t.value;
    }
  }
  return String(result + current);
}

/**
 * Convert number-word runs in `text` to digits. Non-number words and existing digits
 * are preserved; word spacing is normalized to single spaces. Never throws.
 * "ஒரு" (the article) is never a number, so it is left untouched.
 */
export function wordsToDigits(text: string): string {
  if (!text) return text;
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const out: string[] = [];
  let run: Tok[] = [];

  const flush = () => {
    if (run.length > 0) {
      out.push(runToDigits(run));
      run = [];
    }
  };

  for (const w of words) {
    const c = classify(w);
    if (c.value !== null || c.mult > 0) run.push(c);
    else {
      flush();
      out.push(w);
    }
  }
  flush();
  return out.join(" ");
}
