/**
 * Prisma client + typed scheme helpers for Urimai.
 *
 * The JSON columns (criteria / exclusions / documents) are stored using the shared
 * domain types. `toScheme()` reconstitutes a DB row into the canonical `Scheme`
 * shape the rest of the app (and the rules engine, Phase 1) expects.
 */
import type { Scheme as SchemeRow } from "@prisma/client";
import type { DocRef, Rule, Scheme } from "@urimai/types";
import { getPrisma } from "./client.js";

/** Convert a Prisma row into the canonical domain `Scheme`. */
export function toScheme(row: SchemeRow): Scheme {
  return {
    id: row.key, // domain id == stable scheme key
    name: row.name,
    nameTamil: row.nameTamil,
    department: row.department,
    benefit: row.benefit,
    note: row.note,
    criteria: row.criteria as unknown as Rule[],
    exclusions: row.exclusions as unknown as Rule[],
    documents: row.documents as unknown as DocRef[],
    applyAt: row.applyAt,
    version: row.version,
    effectiveFrom: row.effectiveFrom ? row.effectiveFrom.toISOString() : null,
    source: row.source,
    verified: row.verified,
  };
}

/** Load the latest version of every scheme, as canonical `Scheme` objects. */
export async function listLatestSchemes(): Promise<Scheme[]> {
  const rows = await getPrisma().scheme.findMany({
    orderBy: [{ key: "asc" }, { version: "desc" }],
  });

  // Keep only the highest version per key.
  const seen = new Set<string>();
  const latest: SchemeRow[] = [];
  for (const row of rows) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    latest.push(row);
  }

  return latest.map(toScheme);
}

export { SEED_SCHEMES } from "./seed-data.js";
export { getPrisma, PrismaClient } from "./client.js";
export { encryptString, decryptString, encryptJson, decryptJson, getPiiKey } from "./crypto.js";
export { writeAudit, listAudit, type AuditEntry } from "./audit.js";
export { createBeneficiaryRecord, type ApplyInput } from "./beneficiary.js";
export { DbEscalationQueue, listPendingEscalations, resolveEscalation, type EscalationInput } from "./escalation.js";
export type { SchemeRow };
