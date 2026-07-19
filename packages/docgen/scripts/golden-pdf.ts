/**
 * Generate the golden sample outputs for the Phase 1 manual visual check, plus the
 * checked-in golden document.xml the docx structure test compares against:
 *
 *   pnpm --filter @urimai/docgen golden
 *
 * Writes (git-ignored, for human eyes):   .golden-out/sample.{pdf,png,docx,txt}
 * Writes (checked in, the test golden):   test/golden/document.xml
 *
 * Run it after any INTENTIONAL layout change, eyeball the PNG/PDF for correct Tamil
 * conjunct shaping (ஸ்ரீ, க்ஷே, ட்டு must be single glyph clusters, no dotted circles),
 * and commit the refreshed document.xml.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { assembleLetterText, draftHash } from "../src/text.js";
import { draftToDocx } from "../src/docx.js";
import { chromiumAvailable, draftToPdf, draftToPng } from "../src/pdf.js";
import { GOLDEN_DRAFT } from "../test/fixtures.js";

const out = (p: string) => fileURLToPath(new URL(`../.golden-out/${p}`, import.meta.url));
const goldenDir = (p: string) => fileURLToPath(new URL(`../test/golden/${p}`, import.meta.url));

mkdirSync(fileURLToPath(new URL("../.golden-out/", import.meta.url)), { recursive: true });
mkdirSync(fileURLToPath(new URL("../test/golden/", import.meta.url)), { recursive: true });

// 1. Plain text + hash — the canonical form.
writeFileSync(out("sample.txt"), assembleLetterText(GOLDEN_DRAFT), "utf8");
console.log(`sample.txt      written (sha256 ${draftHash(GOLDEN_DRAFT).slice(0, 16)}…)`);

// 2. docx — twice, to prove the packed document.xml is deterministic before golden-ing it.
const docx1 = await draftToDocx(GOLDEN_DRAFT);
const docx2 = await draftToDocx(GOLDEN_DRAFT);
const xml = async (b: Buffer) => (await JSZip.loadAsync(b)).file("word/document.xml")!.async("string");
const [x1, x2] = [await xml(docx1), await xml(docx2)];
if (x1 !== x2) throw new Error("document.xml is NOT deterministic across runs — golden test would flake");
writeFileSync(out("sample.docx"), docx1);
writeFileSync(goldenDir("document.xml"), x1, "utf8");
console.log("sample.docx     written; test/golden/document.xml refreshed (deterministic ✓)");

// 3. PDF + PNG via headless Chromium — the Tamil-shaping route.
if (await chromiumAvailable()) {
  writeFileSync(out("sample.pdf"), await draftToPdf(GOLDEN_DRAFT));
  writeFileSync(out("sample.png"), await draftToPng(GOLDEN_DRAFT));
  console.log("sample.pdf/png  written — EYEBALL THEM: conjuncts (ஸ்ரீ, க்ஷே, ட்டு) must shape correctly");
} else {
  console.warn("Chromium unavailable — PDF/PNG golden outputs skipped");
}
