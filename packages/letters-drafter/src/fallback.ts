/**
 * The deterministic fallback body — the user's own collected words, lightly framed.
 * Used when the LLM is down, returns junk, or fails the facts-only guard. Not elegant
 * prose, but every word is the user's; a plain letter always beats a fabricated one.
 */
import type { LetterFacts } from "@urimai/types";
import { BLANK, type Language } from "./skeleton.js";

const FRAME: Record<Language, { intro: string; prior: string; relief: string }> = {
  ta: {
    intro: "விவரம்:",
    prior: "முன் முயற்சிகள்:",
    relief: "கோரிக்கை:",
  },
  en: {
    intro: "Details:",
    prior: "Earlier attempts:",
    relief: "Request:",
  },
  bilingual: {
    intro: "விவரம் / Details:",
    prior: "முன் முயற்சிகள் / Earlier attempts:",
    relief: "கோரிக்கை / Request:",
  },
};

export function buildFallbackBody(facts: LetterFacts, language: Language): string[] {
  const f = FRAME[language];
  const paragraphs: string[] = [];

  const detail = [facts.incident_details, facts.incident_place, facts.incident_date, facts.amount]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join(" — ");
  paragraphs.push(detail.length > 0 ? `${f.intro} ${detail}` : `${f.intro} ${BLANK}`);

  if (facts.prior_attempts) paragraphs.push(`${f.prior} ${facts.prior_attempts}`);
  if (facts.relief_sought) paragraphs.push(`${f.relief} ${facts.relief_sought}`);

  return paragraphs;
}
