/**
 * Office-directory helpers — mirrors the scheme/letter-type pattern: JSON columns in
 * shared domain shapes, `toOffice()` reconstitutes a row, latest version per key wins.
 * Seed input is the curator-authored data/offices.seed.json at the repo root.
 */
import type { Office as OfficeRow } from "@prisma/client";
import type { Office } from "@urimai/types";
import { getPrisma } from "./client.js";

export function toOffice(row: OfficeRow): Office {
  return {
    id: row.key,
    designation: row.designation,
    designationTamil: row.designationTamil,
    department: row.department,
    addressLines: row.addressLines as unknown as string[],
    pincode: row.pincode,
    phone: row.phone,
    email: row.email,
    level: row.level,
    district: row.district,
    handles: row.handles as unknown as string[],
    ccFor: row.ccFor as unknown as string[],
    version: row.version,
    source: row.source,
    verified: row.verified,
    notes: row.notes,
  };
}

/** Load the latest version of every office, as canonical `Office` objects. */
export async function listLatestOffices(): Promise<Office[]> {
  const rows = await getPrisma().office.findMany({ orderBy: [{ key: "asc" }, { version: "desc" }] });
  const seen = new Set<string>();
  const latest: OfficeRow[] = [];
  for (const row of rows) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    latest.push(row);
  }
  return latest.map(toOffice);
}

export type { OfficeRow };
