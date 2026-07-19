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

const prisma = new PrismaClient();

// Curator-authored office directory at the repo root (data/offices.seed.json). Its
// letter-type ids are normalized to the catalogue's here — the curator file spells
// some differently; unknown ids (future letter types) pass through untouched.
const TYPE_ALIASES: Record<string, string> = {
  pension_scheme_grievance: "scheme_grievance",
};
const normalizeTypeIds = (ids: unknown): string[] =>
  (Array.isArray(ids) ? ids : []).map((id) => TYPE_ALIASES[String(id)] ?? String(id));

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

  console.log("\nSeeding office directory (curator-authored data/offices.seed.json)...\n");

  const officesRaw = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../data/offices.seed.json", import.meta.url)), "utf8"),
  ) as Array<Record<string, unknown>>;

  for (const o of officesRaw) {
    const jurisdiction = (o.jurisdiction ?? {}) as { level?: string; district?: string };
    const data = {
      designation: String(o.designation ?? ""),
      designationTamil: String(o.designationTamil ?? ""),
      department: String(o.department ?? ""),
      addressLines: (o.addressLines ?? []) as unknown as object,
      pincode: o.pincode == null ? null : String(o.pincode),
      phone: o.phone == null ? null : String(o.phone),
      email: o.email == null ? null : String(o.email),
      level: jurisdiction.level ?? "state",
      district: jurisdiction.district ?? null,
      handles: normalizeTypeIds(o.handles) as unknown as object,
      ccFor: normalizeTypeIds(o.ccFor) as unknown as object,
      source: String(o.source ?? ""),
      verified: Boolean(o.verified ?? false),
      notes: String(o.notes ?? ""),
    };
    const key = String(o.id);
    const version = Number(o.version ?? 1);
    await prisma.office.upsert({
      where: { key_version: { key, version } },
      update: data,
      create: { key, version, ...data },
    });
    const flag = String(o.notes ?? "").includes("PLACEHOLDER") ? "  ⚠ placeholder address" : "";
    console.log(`  ✓ ${key}  (v${version}, verified: ${data.verified})${flag}`);
  }

  const keepOffices = officesRaw.map((o) => String(o.id));
  const removedOffices = await prisma.office.deleteMany({ where: { key: { notIn: keepOffices } } });
  if (removedOffices.count > 0) console.log(`\n  – removed ${removedOffices.count} stale office row(s)`);

  const officeCount = await prisma.office.count();
  console.log(`\nDone. ${officeCount} office rows in the database.`);
  console.log("Reminder: every office is verified:false — designations and addresses need human sign-off.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
