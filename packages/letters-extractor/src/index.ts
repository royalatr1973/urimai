/**
 * @urimai/letters-extractor — narration → letter type + letter facts (Madal Phase 2).
 *
 * Two SEPARATE narrow Claude calls (classify, extract) with strict-JSON prompts, zod
 * validation, and safe fallbacks (generic petition / empty facts). Copied from the
 * Urimai extractor pattern (LETTERS_BRIEF §3). The LLM structures; the USER decides —
 * drafting is Phase 3, and nothing here ever invents a fact (§2.1–2.2).
 */
export { classifyLetter, GENERIC_FALLBACK_ID } from "./classify.js";
export {
  buildAddresseeSearchPrompt,
  OFFICIAL_DOMAINS,
  parseAddresseeSearch,
  searchAddressee,
  type AddresseeSearchResult,
  type SearchAddresseeOptions,
  type SearchClient,
} from "./addressee.js";
export { extractLetterFacts, type ExtractFactsOptions } from "./extract.js";
export { parseClassification, parseLetterFacts, sanitizeLetterFacts, type Classification } from "./schema.js";
export {
  CLASSIFY_SYSTEM_PROMPT,
  EXTRACT_SYSTEM_PROMPT,
  buildClassifyUserPrompt,
  buildExtractUserPrompt,
} from "./prompt.js";
export { type CallOptions, type LettersClient } from "./client.js";
