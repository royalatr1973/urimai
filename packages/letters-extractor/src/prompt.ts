/**
 * The two Madal prompts — classification and fact extraction are SEPARATE narrow calls
 * (LETTERS_BRIEF §6: three separate LLM calls — classify, extract, draft — never one
 * mega-prompt; drafting lives in packages/letters-drafter, Phase 3).
 *
 * The extraction golden rule mirrors Urimai's "null over guess": OMIT OVER GUESS. A
 * fact the user didn't state must not exist — an invented name or date on a formal
 * letter is exactly the failure this architecture exists to prevent (§2.2).
 */
import type { FactKey, LetterType } from "@urimai/types";

// --- classification ----------------------------------------------------------

export const CLASSIFY_SYSTEM_PROMPT = `You classify what kind of formal letter a person needs, from their own spoken words (Tamil or English, often transcribed speech).

You ONLY classify. You never draft, never judge the merits, never guess beyond their words.

# OUTPUT
Return ONLY a single JSON object — no prose, no markdown, no code fences:

{
  "letterTypeId": "<one id from the letter-type list>",
  "categoryId": "<one id from the grievance-category list, or null>",
  "language": "ta" | "en" | "bilingual" | null
}

# RULES
- letterTypeId: the single best-fitting letter SKELETON. Judge by what the person NEEDS (an outcome), not by keywords alone. If nothing fits clearly, use the fallback id marked (FALLBACK) — always safe. Never invent an id.
- categoryId: the single most specific grievance category matching their matter (the ids are self-descriptive). null when none fits or no category list is provided. Never invent an id.
- language: set ONLY if the person explicitly asked for the letter in a language ("write it in English", "ஆங்கிலத்தில் வேணும்", "தமிழில் போதும்"). The language they SPOKE in is NOT a request — leave null unless asked.`;

/** One catalogue line per type, with the fallback marked. Ids come from the DB, never hardcoded. */
export function buildClassifyUserPrompt(
  text: string,
  types: Pick<LetterType, "id" | "nameEnglish" | "nameTamil">[],
  fallbackId: string,
  categoryIds: string[] = [],
): string {
  const list = types
    .map((t) => `- ${t.id}: ${t.nameEnglish} / ${t.nameTamil}${t.id === fallbackId ? "  (FALLBACK)" : ""}`)
    .join("\n");
  const cats = categoryIds.length > 0 ? `\n\nGrievance categories (pick the most specific, or null):\n${categoryIds.join(", ")}` : "";
  return `Available letter types:\n${list}${cats}\n\nPerson's words:\n"""\n${text}\n"""\n\nReturn the JSON classification object now.`;
}

// --- fact extraction ---------------------------------------------------------

export const EXTRACT_SYSTEM_PROMPT = `You extract letter-writing facts from a person's own words (Tamil or English, often transcribed speech), so a separate drafting step can write a formal letter for them.

You ONLY structure what was said. You never draft and you NEVER invent.

# THE GOLDEN RULE: omit over guess
Include a key ONLY when the person clearly stated that fact. If something is unsaid, unclear, or hedged — OMIT the key entirely. Never fabricate names, dates, amounts, addresses, offices, or details. An invented fact on a formal letter harms a real person; a missing fact is safe because the system will simply ask.

# OUTPUT
Return ONLY a single JSON object — no prose, no markdown, no code fences. Include ONLY the keys you have evidence for, from exactly this set (all values are strings):

sender_name         the writer's own name
sender_address      the writer's address (as much as they gave)
sender_phone        the writer's phone number
addressee_name      the named person the letter goes TO
addressee_office    the office/authority it goes to (police station, municipality, PIO, employer...)
addressee_address   the addressee's address/place if stated
subject             the topic ONLY if they stated one in so many words
incident_date       when it happened, as they said it ("last Monday", "01-07-2026", "மூணு வாரமா")
incident_place      where it happened
incident_details    their account of what happened / what they need, condensed but ONLY from their words
prior_attempts      earlier complaints/visits/attempts they described
amount              a money amount involved, as stated (keep units: "₹8,000", "எட்டாயிரம் ரூபா")
reference_ids       application numbers, FIR numbers, consumer numbers etc. they quoted
relief_sought       what they want done, in their words
attachments         documents they said they have / will attach
copy_to             who else should receive a copy (நகல்), ONLY if they named someone

# RULES
- Keep values in the person's own language; short verbatim-flavoured phrases, not your rewording (incident_details may be condensed but must contain only their content).
- NOTHING the person says may be lost: if a reply carries extra narrative detail beyond the fact that was asked (background, who was involved, consequences, feelings that matter to the case), capture that detail under incident_details too — details are ACCUMULATED across turns, never dropped.
- The writer vs the addressee: "நான்"/"I" facts are sender_*; who it should go to is addressee_*.
- "I don't know" about a fact → omit that key.
- Do NOT classify the letter type and do NOT add keys outside the set.`;

/**
 * Descriptions used when the gap loop just asked about one fact — so a bare reply
 * ("சாந்தி", "9876543210", "எட்டாயிரம்") lands on the right key instead of being dropped.
 * Same mechanism as the Urimai extractor's pendingField context.
 */
const FACT_CONTEXT: Record<FactKey, string> = {
  sender_name: "the writer's own name — a bare name is the answer",
  sender_address: "the writer's address — a bare address/village/street answer belongs here",
  sender_phone: "the writer's phone number — a bare number of ~10 digits is the answer",
  addressee_name: "the name of the person the letter goes to",
  addressee_office: "the office/authority the letter goes to — a bare office or place name is the answer",
  addressee_address: "the addressee's address",
  subject: "the letter's subject line",
  incident_date: "when it happened — a bare date/day phrase is the answer",
  incident_place: "where it happened — a bare place name is the answer",
  incident_details: "what happened / what they need, in their words",
  prior_attempts: "earlier complaints or visits about this — a bare yes-with-detail belongs here; a bare \"no\"/\"இல்லை\" means none, omit the key",
  amount: "the money amount involved — a bare number or amount phrase is the answer (keep units as spoken)",
  reference_ids: "any application/FIR/consumer number — a bare code or number is the answer",
  relief_sought: "what they want done",
  attachments: "documents they have or will attach — a bare \"no\"/\"இல்லை\" means none, omit the key",
  copy_to: "who else should get a copy (நகல்) of the letter — a bare office/person name is the answer; a bare \"no\"/\"இல்லை\"/\"வேண்டாம்\" means nobody, omit the key",
};

/** Wrap the narration for extraction; `pendingFact` = the fact the gap loop just asked about. */
export function buildExtractUserPrompt(text: string, pendingFact?: FactKey | null): string {
  const context = pendingFact && FACT_CONTEXT[pendingFact]
    ? `\n\nContext for this reply: in the previous turn, the system asked the user for "${pendingFact}" — ${FACT_CONTEXT[pendingFact]}. If this reply is a bare answer, record it under that key. Tamil speech transcription may render spoken English phonetically ("எஸ்" = yes, "நோ" = no). If the reply also contains other facts, extract those too — still never inventing.`
    : "";
  return `Person's words:\n"""\n${text}\n"""${context}\n\nReturn the JSON facts object now.`;
}
