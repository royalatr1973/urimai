/**
 * Seed the four launch schemes from the canonical SEED_SCHEMES data.
 *
 * The data (and its "confirm before production" caveats) lives in src/seed-data.ts so the
 * seeder and tests share one source of truth. This file only writes it into Postgres.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { SEED_SCHEMES } from "../src/seed-data.js";
import { SEED_LETTER_TYPES } from "../src/letter-seed-data.js";
import { parseGrievanceCsv } from "../src/grievance.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Urimai schemes (curator-verified)...\n");

  for (const s of SEED_SCHEMES) {
    const data = {
      name: s.name,
      nameTamil: s.nameTamil,
      department: s.department,
      benefit: s.benefit,
      note: s.note,
      applyAt: s.applyAt,
      effectiveFrom: s.effectiveFrom ? new Date(s.effectiveFrom) : null,
      source: s.source,
      verified: s.verified,
      criteria: s.criteria as unknown as object,
      exclusions: s.exclusions as unknown as object,
      documents: s.documents as unknown as object,
    };
    await prisma.scheme.upsert({
      where: { key_version: { key: s.id, version: s.version } },
      update: data,
      create: { key: s.id, version: s.version, ...data },
    });
    console.log(`  ✓ ${s.id}  (v${s.version}, verified: ${s.verified})`);
  }

  const keep = SEED_SCHEMES.map((s) => s.id);
  const removed = await prisma.scheme.deleteMany({ where: { key: { notIn: keep } } });
  if (removed.count > 0) console.log(`\n  – removed ${removed.count} stale scheme row(s)`);

  const count = await prisma.scheme.count();
  console.log(`\nDone. ${count} scheme rows in the database.`);
  console.log("Reminder: confirm GO numbers + the open items in seed-data.ts before production.");

  console.log("\nSeeding Madal letter types (ALL unverified — curator review pending)...\n");

  for (const t of SEED_LETTER_TYPES) {
    const data = {
      nameTamil: t.nameTamil,
      nameEnglish: t.nameEnglish,
      addresseeHint: t.addresseeHint,
      requiredFacts: t.requiredFacts as unknown as object,
      optionalFacts: t.optionalFacts as unknown as object,
      languageDefault: t.languageDefault,
      legalRefs: t.legalRefs as unknown as object,
      bodyGuidance: t.bodyGuidance,
      source: "LETTERS_BRIEF.md seed set (curator review pending)",
      verified: t.verified,
    };
    await prisma.letterType.upsert({
      where: { key_version: { key: t.id, version: t.version } },
      update: data,
      create: { key: t.id, version: t.version, ...data },
    });
    console.log(`  ✓ ${t.id}  (v${t.version}, verified: ${t.verified})`);
  }

  const keepTypes = SEED_LETTER_TYPES.map((t) => t.id);
  const removedTypes = await prisma.letterType.deleteMany({ where: { key: { notIn: keepTypes } } });
  if (removedTypes.count > 0) console.log(`\n  – removed ${removedTypes.count} stale letter-type row(s)`);

  const typeCount = await prisma.letterType.count();
  console.log(`\nDone. ${typeCount} letter-type rows in the database.`);
  console.log("Reminder: every letter type is verified:false — addressee formats and legal refs need human sign-off.");

  // Office directory REMOVED (curator decision, 2026-07-22): the generic state-office
  // fallback over-escalated routine complaints (e.g. copying the CM's Cell / Human
  // Rights Commission). To/CC now come from the 300 grievance categories' own chains;
  // web search remains the rare last resort. Clear any rows left from earlier seeds.
  const clearedOffices = await prisma.office.deleteMany({});
  if (clearedOffices.count > 0) console.log(`\nCleared ${clearedOffices.count} office directory row(s) — directory retired.`);

  console.log("\nSeeding grievance categories (curator-authored data/grievance_categories.csv)...\n");

  const grievanceRows = parseGrievanceCsv(
    readFileSync(fileURLToPath(new URL("../../../data/grievance_categories.csv", import.meta.url)), "utf8"),
  );
  const GRIEVANCE_VERSION = 1;
  for (const g of grievanceRows) {
    const data = {
      issueExamples: g.issueExamples as unknown as object,
      toDesignation: g.to,
      cc: g.cc as unknown as object,
      entitiesRequired: g.entitiesRequired as unknown as object,
      source: "data/grievance_categories.csv (curator, July 2026)",
      verified: false,
    };
    await prisma.grievanceCategory.upsert({
      where: { key_version: { key: g.key, version: GRIEVANCE_VERSION } },
      update: data,
      create: { key: g.key, version: GRIEVANCE_VERSION, ...data },
    });
  }
  const keepCats = grievanceRows.map((g) => g.key);
  const removedCats = await prisma.grievanceCategory.deleteMany({ where: { key: { notIn: keepCats } } });
  if (removedCats.count > 0) console.log(`  – removed ${removedCats.count} stale category row(s)`);
  const catCount = await prisma.grievanceCategory.count();
  console.log(`Done. ${catCount} grievance-category rows in the database (all verified:false).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
