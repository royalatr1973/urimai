/**
 * Tamil Nadu PIN code → district, by the first three digits (the postal "sorting district").
 *
 * APPROXIMATE and curator-reviewable: postal prefixes don't line up perfectly with revenue
 * districts (a prefix can span two districts, and some split across prefixes), so this is a
 * district-LEVEL signal, not station/taluk. Its jobs: (1) print a real locality on the
 * letter, (2) route district-level offices. The PIN code itself is always exact; only the
 * district mapping is a best-effort seed — expand/correct it freely.
 */
import type { LetterFacts } from "./index.js";

const TN_PREFIX_DISTRICT: Record<string, string> = {
  "600": "சென்னை",
  "601": "திருவள்ளூர்",
  "602": "திருவள்ளூர்",
  "603": "செங்கல்பட்டு",
  "604": "விழுப்புரம்",
  "605": "விழுப்புரம்",
  "606": "விழுப்புரம்",
  "607": "கடலூர்",
  "608": "கடலூர்",
  "609": "நாகப்பட்டினம்",
  "610": "திருவாரூர்",
  "611": "நாகப்பட்டினம்",
  "612": "தஞ்சாவூர்",
  "613": "தஞ்சாவூர்",
  "614": "திருவாரூர்",
  "620": "திருச்சிராப்பள்ளி",
  "621": "திருச்சிராப்பள்ளி",
  "622": "புதுக்கோட்டை",
  "623": "இராமநாதபுரம்",
  "624": "திண்டுக்கல்",
  "625": "மதுரை",
  "626": "விருதுநகர்",
  "627": "திருநெல்வேலி",
  "628": "தூத்துக்குடி",
  "629": "கன்னியாகுமரி",
  "630": "சிவகங்கை",
  "631": "வேலூர்",
  "632": "வேலூர்",
  "633": "வேலூர்",
  "635": "கிருஷ்ணகிரி",
  "636": "சேலம்",
  "637": "நாமக்கல்",
  "638": "ஈரோடு",
  "639": "கரூர்",
  "641": "கோயம்புத்தூர்",
  "642": "திருப்பூர்",
  "643": "நீலகிரி",
};

/** Normalize to a bare 6-digit TN PIN code (starts with 6), or null. */
export function normalizePincode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = String(raw).match(/\b(6\d{5})\b/);
  return m ? m[1]! : null;
}

/** The (approximate) district for a PIN code — Tamil name, or null if unknown. */
export function districtForPincode(raw: string | null | undefined): string | null {
  const pin = normalizePincode(raw);
  if (!pin) return null;
  return TN_PREFIX_DISTRICT[pin.slice(0, 3)] ?? null;
}

/** The sender's PIN code from facts — the explicit field, else a 6-digit run in the address. */
export function senderPincode(facts: LetterFacts): string | null {
  return normalizePincode(facts.sender_pincode) ?? normalizePincode(facts.sender_address);
}
