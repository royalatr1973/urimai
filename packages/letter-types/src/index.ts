/**
 * @urimai/letter-types — the letter-type catalogue (Madal Phase 1).
 *
 * DB-backed and versioned like schemes: the records themselves are seeded/curated in
 * Postgres (see @urimai/db letter-seed-data), loaded via listLatestLetterTypes, and are
 * the ONLY source of legal citations. This package adds the pure, DB-free helpers the
 * letters orchestrator builds on.
 */
export {
  GENERIC_PETITION_ID,
  resolveLetterType,
  missingRequiredFacts,
  hasAllRequiredFacts,
  resolveLanguage,
} from "./catalogue.js";
export { hasUsableAddress, pickCcOffices, pickToOffice } from "./offices.js";
export { listLatestLetterTypes, listLatestOffices, toLetterType, toOffice, SEED_LETTER_TYPES } from "@urimai/db";
export type { FactKey, LetterFacts, LetterType, Office } from "@urimai/types";
