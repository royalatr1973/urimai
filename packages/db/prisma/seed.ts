/**
 * Seed the four launch schemes from the canonical SEED_SCHEMES data.
 *
 * The data (and its "confirm before production" caveats) lives in src/seed-data.ts so the
 * seeder and tests share one source of truth. This file only writes it into Postgres.
 */
import { PrismaClient } from "@prisma/client";
import { SEED_SCHEMES } from "../src/seed-data.js";
import { SEED_LETTER_TYPES } from "../src/letter-seed-data.js";

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
