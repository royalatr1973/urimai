/**
 * Read-back chunking (§7.6): the draft is spoken in blocks, each under the TTS limit
 * (Sarvam bulbul:v2 caps at 1500 chars; we stay under with margin). Chunks split on
 * the draft's natural block boundaries, greedily merged so short letters stay one or
 * two voice notes. The chunks carry every word of the canonical letter text (same
 * blocks, same order) — the user hears everything they are approving.
 */
import type { LetterDraft } from "@urimai/types";
import { assembleLetterText, letterLabels } from "@urimai/docgen";

export const TTS_CHUNK_LIMIT = 1400;

/** The draft's natural read-back blocks, in canonical order. */
function draftBlocks(draft: LetterDraft): string[] {
  const L = letterLabels(draft.language);
  return [
    `${L.from}\n${draft.senderBlock}`,
    `${L.to}\n${draft.addresseeBlock}`,
    `${L.date} ${draft.date}`,
    `${L.subject} ${draft.subject}`,
    draft.salutation,
    ...draft.bodyParagraphs,
    draft.closing,
    draft.signatureLine,
  ];
}

/** Greedily merge blocks into chunks ≤ limit. A single oversize block is hard-split. */
export function chunkReadback(draft: LetterDraft, limit = TTS_CHUNK_LIMIT): string[] {
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    if (current.length > 0) chunks.push(current);
    current = "";
  };

  for (const block of draftBlocks(draft)) {
    const pieces = block.length <= limit ? [block] : (block.match(new RegExp(`[\\s\\S]{1,${limit}}`, "g")) ?? []);
    for (const piece of pieces) {
      if (current.length === 0) current = piece;
      else if (current.length + 2 + piece.length <= limit) current = `${current}\n\n${piece}`;
      else {
        push();
        current = piece;
      }
    }
  }
  push();
  return chunks;
}

export { assembleLetterText };
