/**
 * Typed letter-type helpers — mirrors the scheme helpers: JSON columns are stored in the
 * shared domain shapes, and `toLetterType()` reconstitutes a DB row into the canonical
 * `LetterType` the letters packages (Madal Phase 1+) consume.
 */
import type { LetterType as LetterTypeRow } from "@prisma/client";
import type { FactKey, LetterType } from "@urimai/types";
import { getPrisma } from "./client.js";

/** Convert a Prisma row into the canonical domain `LetterType`. */
export function toLetterType(row: LetterTypeRow): LetterType {
  return {
    id: row.key, // domain id == stable letter-type key
    nameTamil: row.nameTamil,
    nameEnglish: row.nameEnglish,
    addresseeHint: row.addresseeHint,
    requiredFacts: row.requiredFacts as unknown as FactKey[],
    optionalFacts: row.optionalFacts as unknown as FactKey[],
    languageDefault: row.languageDefault as LetterType["languageDefault"],
    legalRefs: row.legalRefs as unknown as LetterType["legalRefs"],
    bodyGuidance: row.bodyGuidance,
    version: row.version,
    verified: row.verified,
  };
}

/** Load the latest version of every letter type, as canonical `LetterType` objects. */
export async function listLatestLetterTypes(): Promise<LetterType[]> {
  const rows = await getPrisma().letterType.findMany({
    orderBy: [{ key: "asc" }, { version: "desc" }],
  });

  const seen = new Set<string>();
  const latest: LetterTypeRow[] = [];
  for (const row of rows) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    latest.push(row);
  }

  return latest.map(toLetterType);
}

export type { LetterTypeRow };
