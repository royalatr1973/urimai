/**
 * LetterDraft → .pdf via headless Chromium (puppeteer). Chosen deliberately: Chromium's
 * text stack shapes Tamil conjuncts correctly (ஸ்ரீ, க்ஷ, ...) where direct PDF text
 * drawing (pdf-lib et al.) does not (LETTERS_BRIEF §4). The vendored Noto Sans Tamil is
 * embedded as a data URL, so rendering needs no network and no installed fonts.
 */
import puppeteer, { type Browser } from "puppeteer";
import type { LetterDraft } from "@urimai/types";
import { tamilFontDataUrl } from "./font.js";
import { renderLetterHtml } from "./html.js";

const LAUNCH_ARGS = ["--no-sandbox", "--disable-dev-shm-usage"];

/** Whether a Chromium can actually launch here (false on CI runners without it). */
export async function chromiumAvailable(): Promise<boolean> {
  try {
    const b = await puppeteer.launch({ args: LAUNCH_ARGS });
    await b.close();
    return true;
  } catch {
    return false;
  }
}

async function withBrowser<T>(fn: (b: Browser) => Promise<T>): Promise<T> {
  const browser = await puppeteer.launch({ args: LAUNCH_ARGS });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

/** Render the draft to A4 PDF bytes, ready to send as a WhatsApp document. */
export async function draftToPdf(draft: LetterDraft): Promise<Buffer> {
  const html = renderLetterHtml(draft, { fontDataUrl: tamilFontDataUrl() });
  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "22mm", right: "18mm" },
    });
    return Buffer.from(pdf);
  });
}

/**
 * Screenshot of page 1 as PNG — the golden-sample visual check (a human eyeballing
 * conjunct shaping) and, later, a WhatsApp-previewable image of the letter.
 */
export async function draftToPng(draft: LetterDraft): Promise<Buffer> {
  const html = renderLetterHtml(draft, { fontDataUrl: tamilFontDataUrl() });
  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    // A4 proportions at 96dpi, with margins similar to the PDF route.
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
    await page.setContent(
      html.replace("<body>", '<body style="padding: 75px 68px 75px 83px">'),
      { waitUntil: "load" },
    );
    const png = await page.screenshot({ type: "png", fullPage: true });
    return Buffer.from(png);
  });
}
