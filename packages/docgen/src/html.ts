/**
 * LetterDraft → print-ready HTML. The skeleton (block order, labels, layout) is rendered
 * deterministically here — the LLM never touches structure (LETTERS_BRIEF §2.3). The
 * HTML route exists because headless Chromium shapes Tamil conjuncts correctly where
 * direct PDF text drawing does not (§4).
 */
import type { LetterDraft } from "@urimai/types";
import { letterLabels } from "./text.js";

export interface RenderHtmlOptions {
  /** data: URL of a Tamil-capable font to embed; omit to rely on system fonts. */
  fontDataUrl?: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderLetterHtml(draft: LetterDraft, opts: RenderHtmlOptions = {}): string {
  const L = letterLabels(draft.language);
  const fontFace = opts.fontDataUrl
    ? `@font-face { font-family: "Noto Sans Tamil"; src: url("${opts.fontDataUrl}") format("truetype"); }`
    : "";

  const body = draft.bodyParagraphs.map((p) => `<p class="body">${esc(p)}</p>`).join("\n    ");

  return `<!DOCTYPE html>
<html lang="${draft.language === "en" ? "en" : "ta"}">
<head>
<meta charset="utf-8">
<style>
  ${fontFace}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { font-family: "Noto Sans Tamil", "Nirmala UI", "Latha", sans-serif; font-size: 12pt; line-height: 1.65; color: #000; }
  body { padding: 0; }
  .block { white-space: pre-line; margin-bottom: 1em; }
  .label { font-weight: 600; }
  .date { margin-bottom: 1em; }
  .subject { font-weight: 600; margin-bottom: 1em; }
  .salutation { margin-bottom: 1em; }
  p.body { text-align: justify; margin-bottom: 1em; }
  .closing { margin-bottom: 2.5em; }
  .signature { white-space: pre-line; text-align: right; }
  .copyto { white-space: pre-line; margin-top: 2em; }
</style>
</head>
<body>
  <div class="block"><span class="label">${esc(L.from)}</span>
${esc(draft.senderBlock)}</div>
  <div class="block"><span class="label">${esc(L.to)}</span>
${esc(draft.addresseeBlock)}</div>
  <div class="date"><span class="label">${esc(L.date)}</span> ${esc(draft.date)}</div>
  <div class="subject">${esc(L.subject)} ${esc(draft.subject)}</div>
  <div class="salutation">${esc(draft.salutation)}</div>
    ${body}
  <div class="closing">${esc(draft.closing)}</div>
  <div class="signature">${esc(draft.signatureLine)}</div>
${draft.copyTo ? `  <div class="copyto"><span class="label">${esc(L.copyTo)}</span> ${esc(draft.copyTo)}</div>\n` : ""}</body>
</html>`;
}
