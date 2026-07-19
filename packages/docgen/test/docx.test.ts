/**
 * Golden-file test for docx STRUCTURE (LETTERS_BRIEF Phase 1 acceptance): the packed
 * word/document.xml must match the checked-in golden byte-for-byte. Regenerate the
 * golden ONLY for an intentional layout change:
 *
 *   pnpm --filter @urimai/docgen golden
 *
 * (jszip is docx's own zip engine — same version, no new external code, test-only.)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { draftToDocx } from "../src/docx.js";
import { GOLDEN_DRAFT } from "./fixtures.js";

async function part(docx: Buffer, path: string): Promise<string> {
  const zip = await JSZip.loadAsync(docx);
  const file = zip.file(path);
  expect(file, `${path} missing from the .docx package`).toBeTruthy();
  return file!.async("string");
}
const documentXml = (docx: Buffer) => part(docx, "word/document.xml");

describe("draftToDocx", () => {
  it("produces a valid docx package containing every letter block", async () => {
    const buf = await draftToDocx(GOLDEN_DRAFT);
    expect(buf.subarray(0, 2).toString("ascii")).toBe("PK"); // zip magic
    const xml = await documentXml(buf);
    for (const s of [
      "அனுப்புநர்:",
      "பெறுநர்:",
      GOLDEN_DRAFT.subject,
      GOLDEN_DRAFT.salutation,
      ...GOLDEN_DRAFT.bodyParagraphs,
      "நன்றி.",
      "(கையொப்பம் / இடது பெருவிரல் ரேகை)",
    ]) {
      expect(xml).toContain(s);
    }
    // The default run font must be a Tamil-shaping font available on office Windows PCs.
    // (Document-level default fonts live in the styles part, not document.xml.)
    expect(await part(buf, "word/styles.xml")).toContain("Nirmala UI");
  });

  it("matches the checked-in golden document.xml exactly", async () => {
    const xml = await documentXml(await draftToDocx(GOLDEN_DRAFT));
    const golden = readFileSync(
      fileURLToPath(new URL("./golden/document.xml", import.meta.url)),
      "utf8",
    );
    expect(xml).toBe(golden);
  });
});
