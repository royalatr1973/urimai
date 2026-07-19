/**
 * @urimai/docgen — LetterDraft → text / HTML / .docx / .pdf (Madal Phase 1).
 *
 * Everything here is deterministic rendering of an already-approved draft; no LLM in
 * this package, ever. The skeleton is code + data (LETTERS_BRIEF §2.3); Tamil PDF
 * shaping goes through headless Chromium with the vendored Noto Sans Tamil (§4).
 */
export { assembleLetterText, draftHash, letterLabels, type LetterLabels } from "./text.js";
export { renderLetterHtml, type RenderHtmlOptions } from "./html.js";
export { buildLetterDocument, draftToDocx } from "./docx.js";
export { chromiumAvailable, draftToPdf, draftToPng } from "./pdf.js";
export { tamilFontDataUrl } from "./font.js";
