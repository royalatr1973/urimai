/**
 * The curator grievance CSV (data/grievance_categories.csv) must parse into exactly
 * the shape the seeder and router expect — quoted designations with commas included.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeDesignation, parseCsvLine, parseGrievanceCsv } from "../src/grievance.js";

const CSV = readFileSync(fileURLToPath(new URL("../../../data/grievance_categories.csv", import.meta.url)), "utf8");

describe("parseCsvLine", () => {
  it("handles quoted fields containing commas", () => {
    expect(parseCsvLine('a,"b, c",d')).toEqual(["a", "b, c", "d"]);
    expect(parseCsvLine('x,"he said ""hi""",z')).toEqual(["x", 'he said "hi"', "z"]);
  });
});

describe("parseGrievanceCsv — the curator's 300 categories", () => {
  const rows = parseGrievanceCsv(CSV);

  it("parses all 300 rows with unique keys", () => {
    expect(rows).toHaveLength(300);
    expect(new Set(rows.map((r) => r.key)).size).toBe(300);
  });

  it("every row has a To designation and at least a few issue phrasings", () => {
    for (const r of rows) {
      expect(r.to.length, r.key).toBeGreaterThan(0);
      expect(r.issueExamples.length, r.key).toBeGreaterThanOrEqual(5);
    }
  });

  it("quoted designations with commas survive intact", () => {
    const ration = rows.find((r) => r.key === "ration_card_new")!;
    expect(ration.cc).toContain("Joint Commissioner, Civil Supplies");
  });

  it("known curator typos are normalized at seed time (file untouched)", () => {
    expect(normalizeDesignation("DistrictCollector")).toBe("District Collector");
    const fmb = rows.find((r) => r.key === "fmb_copy")!;
    expect(fmb.cc).toContain("District Collector");
    expect(fmb.cc).not.toContain("DistrictCollector");
  });

  it("escalation chains are ordered nearest-first (To is not repeated in cc)", () => {
    const patta = rows.find((r) => r.key === "patta_transfer")!;
    expect(patta.to).toBe("Tahsildar");
    expect(patta.cc).toEqual(["Revenue Divisional Officer", "District Revenue Officer", "District Collector"]);
    expect(patta.cc).not.toContain(patta.to);
  });
});
