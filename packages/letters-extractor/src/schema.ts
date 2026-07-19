/**
 * Robust parsing + validation of model output (LETTERS_BRIEF Phase 2 acceptance:
 * malformed model output never crashes). Same posture as the Urimai extractor's
 * schema: best-effort JSON recovery, per-key validation, safe fallbacks —
 * classification falls back to the generic petition, extraction to empty facts.
 */
import { z } from "zod";
import { FACT_KEYS, type FactKey, type LetterFacts } from "@urimai/types";

export interface Classification {
  letterTypeId: string;
  language: "ta" | "en" | "bilingual" | null;
}

const languageSchema = z.enum(["ta", "en", "bilingual"]);

/**
 * Best-effort extraction of a JSON object from arbitrary model text: direct parse,
 * then the first `{` … last `}` slice (handles code fences / surrounding prose).
 */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(raw.trim());
  if (direct) return direct;

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return tryParse(raw.slice(start, end + 1));
  }
  return null;
}

/**
 * Parse a classification reply. The letterTypeId must be one of `validIds` — anything
 * else (hallucinated id, junk, no JSON) becomes `fallbackId`. Never throws.
 */
export function parseClassification(raw: string, validIds: string[], fallbackId: string): Classification {
  const fallback: Classification = { letterTypeId: fallbackId, language: null };
  const obj = extractJsonObject(raw ?? "");
  if (!obj) return fallback;

  const id = typeof obj.letterTypeId === "string" && validIds.includes(obj.letterTypeId)
    ? obj.letterTypeId
    : fallbackId;
  const lang = languageSchema.safeParse(obj.language);
  return { letterTypeId: id, language: lang.success ? lang.data : null };
}

/**
 * Validate an arbitrary object into safe letter facts: only known FactKeys, only
 * non-empty strings, trimmed. Everything else is dropped. Never throws. Also serves
 * to sanitize operator-edited facts from the web client later.
 */
export function sanitizeLetterFacts(input: unknown): LetterFacts {
  const facts: LetterFacts = { letterTypeId: null, language: null };
  if (!input || typeof input !== "object" || Array.isArray(input)) return facts;
  const obj = input as Record<string, unknown>;
  for (const key of FACT_KEYS) {
    const v = obj[key];
    if (typeof v === "string" && v.trim().length > 0) facts[key as FactKey] = v.trim();
  }
  return facts;
}

/**
 * Parse a fact-extraction reply into validated LetterFacts. Never throws; junk output
 * yields empty facts. Classification fields are NOT taken from this call — the
 * classifier owns letterTypeId/language (separate narrow calls, §6).
 */
export function parseLetterFacts(raw: string): LetterFacts {
  return sanitizeLetterFacts(extractJsonObject(raw ?? ""));
}
