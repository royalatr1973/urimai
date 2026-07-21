/**
 * Grievance-category helpers + the tiny RFC-4180 CSV parser used to seed them from the
 * curator's data/grievance_categories.csv (quoted fields with commas; no embedded
 * newlines in this dataset).
 */
import type { GrievanceCategory as GrievanceCategoryRow } from "@prisma/client";
import type { GrievanceCategory } from "@urimai/types";
import { getPrisma } from "./client.js";

export function toGrievanceCategory(row: GrievanceCategoryRow): GrievanceCategory {
  return {
    id: row.key,
    issueExamples: row.issueExamples as unknown as string[],
    to: row.toDesignation,
    cc: row.cc as unknown as string[],
    entitiesRequired: (row.entitiesRequired as unknown as string[]) ?? [],
    version: row.version,
    source: row.source,
    verified: row.verified,
  };
}

/** Latest version of every grievance category. */
export async function listLatestGrievanceCategories(): Promise<GrievanceCategory[]> {
  const rows = await getPrisma().grievanceCategory.findMany({ orderBy: [{ key: "asc" }, { version: "desc" }] });
  const seen = new Set<string>();
  const latest: GrievanceCategoryRow[] = [];
  for (const row of rows) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    latest.push(row);
  }
  return latest.map(toGrievanceCategory);
}

/** Minimal RFC-4180 line parser: quoted fields, "" escapes, comma separation. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Known typos in the curator CSV, normalized at seed time (the file stays untouched). */
const DESIGNATION_FIXES: Record<string, string> = {
  DistrictCollector: "District Collector",
};

export const normalizeDesignation = (s: string): string => DESIGNATION_FIXES[s.trim()] ?? s.trim();

export interface GrievanceSeedRow {
  key: string;
  issueExamples: string[];
  to: string;
  cc: string[];
  entitiesRequired: string[];
}

/** Parse the curator CSV content into seed rows. Throws on structural problems. */
export function parseGrievanceCsv(content: string): GrievanceSeedRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]!);
  const expected = ["category", "issue_examples", "to", "cc1", "cc2", "cc3", "entities_required"];
  if (JSON.stringify(header) !== JSON.stringify(expected)) {
    throw new Error(`grievance CSV header mismatch: ${header.join(",")}`);
  }
  return lines.slice(1).map((line, i) => {
    const [key, examples, to, cc1, cc2, cc3, entities] = parseCsvLine(line);
    if (!key || !to) throw new Error(`grievance CSV row ${i + 2}: missing category or to`);
    return {
      key: key.trim(),
      issueExamples: (examples ?? "").split(";").map((e) => e.trim()).filter((e) => e.length > 0),
      to: normalizeDesignation(to),
      cc: [cc1, cc2, cc3].map((c) => normalizeDesignation(c ?? "")).filter((c) => c.length > 0),
      entitiesRequired: (entities ?? "").split(";").map((e) => e.trim()).filter((e) => e.length > 0),
    };
  });
}
