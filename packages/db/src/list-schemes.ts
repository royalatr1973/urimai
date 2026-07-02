/**
 * Phase 0 verification helper: prove the four seeded schemes are queryable.
 *
 *   pnpm schemes:list
 *
 * Prints each scheme with its version, verified flag, and rule counts. This is the
 * quickest way to confirm `pnpm seed` populated the database correctly.
 */
import { getPrisma, listLatestSchemes } from "./index.js";

async function main() {
  const schemes = await listLatestSchemes();

  console.log(`\nUrimai — ${schemes.length} scheme(s) in the database:\n`);
  for (const s of schemes) {
    console.log(`• ${s.name}`);
    console.log(`    தமிழ்     : ${s.nameTamil}`);
    console.log(`    key        : ${s.id}  (v${s.version})`);
    console.log(`    benefit    : ${s.benefit}`);
    console.log(`    verified   : ${s.verified}`);
    console.log(`    criteria   : ${s.criteria.length}  |  exclusions: ${s.exclusions.length}  |  documents: ${s.documents.length}`);
    console.log("");
  }

  const unverified = schemes.filter((s) => !s.verified).length;
  if (unverified > 0) {
    console.log(`⚠ ${unverified} scheme(s) are UNVERIFIED — thresholds are placeholders pending GO confirmation.\n`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
