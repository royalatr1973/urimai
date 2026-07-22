/**
 * Office-directory selection — pure, DB-free (the caller loads the directory). The
 * directory is curator data; these helpers only choose from it, never invent:
 *  - To-office: used ONLY when the user could not name an addressee.
 *  - CC-offices: the curator's ccFor mapping — "relevant persons for copying"
 *    (live-tester request, July 2026) — capped, deduped against the To office.
 */
import type { LetterFacts, Office } from "@urimai/types";

/**
 * Jurisdiction locality for an addressee office — drawn from the case-data entities
 * (the taluk/village/station the matter belongs to). NEVER the sender's own address
 * (that is the FROM block) and NOT the incident scene like "my house". null when we
 * have no jurisdiction hint, in which case only the designation is printed.
 */
const LOCALITY_KEYS = ["police_station", "taluk", "block", "village", "ward_number", "district"];
export function officeLocality(facts: LetterFacts): string | null {
  const ent = facts.entities ?? {};
  for (const k of LOCALITY_KEYS) {
    const v = ent[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

/** An address usable on a letter — placeholder entries are never printed. */
export function hasUsableAddress(office: Office): boolean {
  return (
    office.addressLines.length > 0 &&
    !office.addressLines.some((l) => l.toUpperCase().includes("ADDRESS_TO_VERIFY")) &&
    office.designationTamil.trim().length > 0
  );
}

/** The office to address the letter TO when the user doesn't know one. */
export function pickToOffice(offices: Office[], letterTypeId: string): Office | null {
  return offices.find((o) => o.handles.includes(letterTypeId) && hasUsableAddress(o)) ?? null;
}

const MAX_CC = 2;

/**
 * Curated நகல் recipients for a letter type. Offices that also HANDLE the type come
 * first (the subject-matter authority), then general ones (e.g. the CM cell); the To
 * office itself is excluded; placeholder-address offices may still be CC'd by
 * designation alone (a நகல் line needs no full postal address).
 */
export function pickCcOffices(offices: Office[], letterTypeId: string, excludeOfficeId?: string): Office[] {
  return offices
    .filter((o) => o.ccFor.includes(letterTypeId) && o.id !== excludeOfficeId && o.designationTamil.trim().length > 0)
    .sort((a, b) => Number(b.handles.includes(letterTypeId)) - Number(a.handles.includes(letterTypeId)))
    .slice(0, MAX_CC);
}
