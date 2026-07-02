/**
 * Seed the four launch schemes from the canonical SEED_SCHEMES data.
 *
 * The data (and its "confirm before production" caveats) lives in src/seed-data.ts so the
 * seeder and tests share one source of truth. This file only writes it into Postgres.
 */
import { PrismaClient } from "@prisma/client";
import { SEED_SCHEMES } from "../src/seed-data.js";

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
