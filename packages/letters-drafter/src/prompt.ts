/**
 * The body-drafting prompt — the third and last narrow Madal LLM call (§6). The model
 * writes ONLY body paragraphs, ONLY from the facts JSON it is given. The deterministic
 * guard (guard.ts) enforces what this prompt requests.
 */
import type { LetterFacts, LetterType } from "@urimai/types";
import { FACT_KEYS } from "@urimai/types";
import type { Language } from "./skeleton.js";

export const DRAFT_SYSTEM_PROMPT = `You write the BODY PARAGRAPHS of a formal letter for a citizen, from facts they themselves stated. A separate deterministic system renders everything else (sender, addressee, date, subject, salutation, signature).

# ABSOLUTE RULES
- Use ONLY what the user actually said — the structured facts and, when provided, the full transcript of their own words. Details from the transcript that never made it into a structured fact MAY and SHOULD be used; nothing the user said may be lost. NEVER add names, dates, places, amounts, numbers, offices, or events the user did not say. If an essential detail is missing, write the blank "________" instead.
- NO legal citations of any kind (no Acts, section numbers, IPC/BNSS references) — the system adds any citation itself from verified data.
- Write in the requested language, in a plain, VERY polite and respectful formal register (மிக்க பணிவுடன்) — humble requests, never demands or accusations; the reader is an officer being asked for kind action. Simple words; no flourishes.
- 2 to 4 SHORT paragraphs: what happened / the situation, then (if given) earlier attempts, then the request. Do not repeat the sender's address or the subject line.
- If a correction instruction and a previous body are provided, apply ONLY that change to the previous body, keeping everything else as it was.

# OUTPUT
Return ONLY a single JSON object, no prose, no code fences:
{"bodyParagraphs": ["...", "..."]}`;

const langName: Record<Language, string> = {
  ta: "Tamil",
  en: "English",
  bilingual: "Tamil, followed by an English rendering of the same content in the same paragraph",
};

export interface CorrectionContext {
  instruction: string;
  previousBody: string[];
}

export function buildDraftUserPrompt(
  type: LetterType,
  facts: LetterFacts,
  language: Language,
  correction?: CorrectionContext,
  transcript?: string,
): string {
  const factLines = FACT_KEYS.filter((k) => typeof facts[k] === "string").map((k) => `${k}: ${facts[k]}`);
  const guidance = type.bodyGuidance ? `\nStyle guidance for this letter type: ${type.bodyGuidance}` : "";
  const said = transcript?.trim()
    ? `\n\nEverything the user said this session, verbatim (their own words — you may draw ANY detail from this; do not lose information that isn't in the structured facts):\n"""\n${transcript.trim()}\n"""`
    : "";
  const corr = correction
    ? `\n\nPrevious body paragraphs:\n${JSON.stringify(correction.previousBody)}\nThe user asked for this change (apply it and nothing else): """${correction.instruction}"""`
    : "";
  return `Letter type: ${type.nameEnglish} / ${type.nameTamil}
Language: ${langName[language]}${guidance}

Facts stated by the user:
${factLines.length > 0 ? factLines.join("\n") : "(none)"}${said}${corr}

Return the JSON object now.`;
}
