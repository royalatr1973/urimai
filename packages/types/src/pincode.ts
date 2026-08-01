/**
 * Tamil Nadu PIN code → place.
 *
 * Two layers, in order:
 *  1. EXACT — the official directory (2,068 PIN codes; see data/tn_pincodes.csv and the
 *     generated pincode-data.ts). Gives the district always, and the taluk when the PIN
 *     code maps to exactly one.
 *  2. PREFIX fallback — the first three digits (postal "sorting district"), for PIN codes
 *     missing from the directory. District-level and approximate.
 *
 * Deliberate limit: ~40% of TN PIN codes straddle taluk boundaries, so a taluk is returned
 * only when unambiguous. Naming the wrong Tahsildar would misroute a citizen's letter.
 */
import { lookupPincode } from "./pincode-data.js";
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

/** District for a PIN code — Tamil name. Exact directory first, then the prefix fallback. */
export function districtForPincode(raw: string | null | undefined): string | null {
  const pin = normalizePincode(raw);
  if (!pin) return null;
  return lookupPincode(pin)?.district ?? TN_PREFIX_DISTRICT[pin.slice(0, 3)] ?? null;
}

/**
 * Taluk (sub-district) for a PIN code — ONLY when the PIN code maps to exactly one taluk.
 * null when ambiguous or unknown, so callers fall back to district-level routing rather
 * than naming a taluk office that may not have jurisdiction.
 */
export function talukForPincode(raw: string | null | undefined): string | null {
  const pin = normalizePincode(raw);
  if (!pin) return null;
  return lookupPincode(pin)?.taluk ?? null;
}

/** "TN" | "PY" for a PIN code — Puducherry sits inside TN but has its own government. */
export function stateForPincode(raw: string | null | undefined): string | null {
  const pin = normalizePincode(raw);
  if (!pin) return null;
  return lookupPincode(pin)?.state ?? null;
}

/** The sender's PIN code from facts — the explicit field, else a 6-digit run in the address. */
export function senderPincode(facts: LetterFacts): string | null {
  return normalizePincode(facts.sender_pincode) ?? normalizePincode(facts.sender_address);
}
