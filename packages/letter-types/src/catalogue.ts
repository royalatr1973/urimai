/**
 * Pure catalogue helpers — no I/O. The DB read path lives in @urimai/db
 * (listLatestLetterTypes); everything here operates on already-loaded records so the
 * letters orchestrator (Madal Phase 3) can be tested without a database.
 */
import type { FactKey, LetterFacts, LetterType } from "@urimai/types";

/** The universal fallback — classification must never turn a user away (LETTERS_BRIEF §1). */
export const GENERIC_PETITION_ID = "generic_petition";

/**
 * Find a letter type by id, falling back to the generic petition. Returns null only if
 * the catalogue does not even contain the generic fallback — a data problem the caller
 * must surface loudly, not paper over.
 */
export function resolveLetterType(catalogue: LetterType[], id: string | null): LetterType | null {
  const byId = id ? catalogue.find((t) => t.id === id) : undefined;
  return byId ?? catalogue.find((t) => t.id === GENERIC_PETITION_ID) ?? null;
}

/** Required facts not yet present (missing, empty, or whitespace-only) — drives the gap loop. */
export function missingRequiredFacts(type: LetterType, facts: LetterFacts): FactKey[] {
  return type.requiredFacts.filter((k) => !hasFact(facts, k));
}

/** True when every required fact for the type has been collected. */
export function hasAllRequiredFacts(type: LetterType, facts: LetterFacts): boolean {
  return missingRequiredFacts(type, facts).length === 0;
}

function hasFact(facts: LetterFacts, key: FactKey): boolean {
  const v = facts[key];
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * The letter's output language: the user's explicit choice wins; otherwise the type's
 * default (LETTERS_BRIEF §2.5 — the preference lives on the LetterType record).
 */
export function resolveLanguage(type: LetterType, facts: LetterFacts): "ta" | "en" | "bilingual" {
  return facts.language ?? type.languageDefault;
}
