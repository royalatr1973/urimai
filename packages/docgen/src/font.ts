/**
 * Vendored Noto Sans Tamil (variable font, OFL — license alongside the .ttf). Embedded
 * as a data URL so the PDF renderer needs no network and no installed system fonts:
 * a strict-offline Chromium still shapes Tamil conjuncts correctly.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Resolved relative to this module: works from src/ (tests) and dist/ (runtime) alike,
// both one level below the package root where assets/ lives.
const FONT_URL = new URL("../assets/fonts/NotoSansTamil.ttf", import.meta.url);

let cached: string | null = null;

/** The vendored Tamil font as a `data:` URL for @font-face embedding. */
export function tamilFontDataUrl(): string {
  if (!cached) {
    cached = `data:font/ttf;base64,${readFileSync(fileURLToPath(FONT_URL)).toString("base64")}`;
  }
  return cached;
}
