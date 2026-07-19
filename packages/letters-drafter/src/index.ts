/**
 * @urimai/letters-drafter — LetterType + LetterFacts → LetterDraft (Madal Phase 3).
 *
 * The skeleton is deterministic (data + code, §2.3); the LLM writes ONLY body
 * paragraphs and its output must pass the deterministic facts-only guard or be
 * replaced by a fallback built from the user's own words. Citations enter only via
 * the LetterType record (§2.2). Drafting never throws.
 */
export { draftLetter, parseBodyParagraphs, type DraftOptions, type DraftOutcome, type DrafterClient } from "./draft.js";
export { checkBodyAgainstFacts, type GuardVerdict } from "./guard.js";
export { buildFallbackBody } from "./fallback.js";
export { DRAFT_SYSTEM_PROMPT, buildDraftUserPrompt, type CorrectionContext } from "./prompt.js";
export {
  BLANK,
  buildAddresseeBlock,
  buildSenderBlock,
  buildSignatureLine,
  buildSubject,
  formatDate,
  stripCuratorMarkers,
  type Language,
} from "./skeleton.js";
