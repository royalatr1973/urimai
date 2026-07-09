/**
 * The four curator-approved Tamil eligibility cards (the "Manjal Oli" set, one per scheme).
 *
 * Sent to every user ONCE per session, appended to their first results message. Rationale
 * (curator decision, July 2026): welfare in TN is household-level — the man who just heard
 * "Old Age only" has a wife who may fit KMUT or the widow pension, and phones are shared.
 * Showing all four cards covers the household without another question. The cards carry
 * their own "details may change — confirm officially" disclaimer, so they stay honest
 * standing alone when forwarded.
 *
 * The PNGs live in apps/whatsapp/assets/cards/ and are versioned with the code: a rule
 * change that redraws a card ships in the same commit as the seed change it reflects.
 */
import { readFile } from "node:fs/promises";

export interface ConditionCard {
  schemeId: string;
  file: string;
  captionTamil: string;
}

/** Order: the three pensions first (oldest-reaching audience), KMUT last. */
export const CONDITION_CARDS: ConditionCard[] = [
  { schemeId: "oldage", file: "OAP_Tamil_Card.png", captionTamil: "முதியோர் ஓய்வூதியம் — தகுதி விவரங்கள்" },
  { schemeId: "widow", file: "DWPS_Tamil_Card.png", captionTamil: "ஆதரவற்ற விதவை ஓய்வூதியம் — தகுதி விவரங்கள்" },
  { schemeId: "disabled", file: "DAPS_Tamil_Card.png", captionTamil: "மாற்றுத்திறனாளி ஓய்வூதியம் — தகுதி விவரங்கள்" },
  { schemeId: "kmut", file: "KMUT_Tamil_Card.png", captionTamil: "கலைஞர் மகளிர் உரிமைத் தொகை — தகுதி விவரங்கள்" },
];

/** One-line Tamil lead-in sent before the four cards, so they don't arrive unexplained. */
export const CARDS_INTRO_TAMIL =
  "உங்கள் குடும்பத்தில் யாருக்காவது பொருந்தலாம் — நான்கு திட்டங்களின் தகுதி விவரங்கள்:";

const cache = new Map<string, Buffer>();

/** Load a card PNG from assets/, cached for the process lifetime (they never change at runtime). */
export async function loadCardImage(file: string): Promise<Buffer> {
  const hit = cache.get(file);
  if (hit) return hit;
  // Resolves from both src/ (tsx) and dist/ (compiled) — assets/ sits beside them.
  const bytes = await readFile(new URL(`../assets/cards/${file}`, import.meta.url));
  cache.set(file, bytes);
  return bytes;
}
