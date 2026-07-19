/**
 * PDF smoke test — runs only where a Chromium can launch (local dev boxes; CI runners
 * without a browser skip it rather than fail). The REAL acceptance for shaping quality
 * is the manual visual check of the golden sample: `pnpm --filter @urimai/docgen golden`.
 */
import { describe, it, expect } from "vitest";
import { chromiumAvailable, draftToPdf } from "../src/pdf.js";
import { GOLDEN_DRAFT } from "./fixtures.js";

const hasChromium = await chromiumAvailable();

describe.skipIf(!hasChromium)("draftToPdf (requires Chromium)", () => {
  it("renders an A4 PDF with the embedded Tamil font", { timeout: 60_000 }, async () => {
    const pdf = await draftToPdf(GOLDEN_DRAFT);
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    // An embedded font + real content: a blank/failed render would be far smaller.
    expect(pdf.length).toBeGreaterThan(20_000);
  });
});

if (!hasChromium) {
  console.warn("[docgen] Chromium unavailable — PDF smoke test skipped (golden visual check still required locally)");
}
