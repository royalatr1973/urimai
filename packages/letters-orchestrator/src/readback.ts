/**
 * Read-back chunking (§7.6): the draft is spoken in blocks, each under the TTS limit
 * (Sarvam bulbul:v2 caps at 1500 chars; we stay under with margin). Chunks split on
 * the draft's natural block boundaries, greedily merged so short letters stay one or
 * two voice notes. The chunks carry every word of the canonical letter text (same
 * blocks, same order) — the user hears everything they are approving.
 */
import type { LetterDraft } from "@urimai/types";
import { assembleLetterText, letterLabels } from "@urimai/docgen";

/**
 * Short on purpose: live testing (July 2026) showed long single voice notes arriving
 * with the tail of the letter missing — small chunks mean MORE voice notes but each
 * one complete. (Sarvam's hard cap is 1500; we stay far below it.)
 */
export const TTS_CHUNK_LIMIT = 500;

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
    ...(draft.copyTo ? [`${L.copyTo} ${draft.copyTo}`] : []),
  ];
}

/** Greedily merge blocks into chunks ≤ limit. A single oversize block is hard-split. */
function chunkBlocks(blocks: string[], limit: number): string[] {
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    if (current.length > 0) chunks.push(current);
    current = "";
  };

  for (const block of blocks) {
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

export function chunkReadback(draft: LetterDraft, limit = TTS_CHUNK_LIMIT): string[] {
  return chunkBlocks(draftBlocks(draft), limit);
}

/**
 * After a correction, re-read ONLY what changed (§7.6 — live testers heard the whole
 * letter again on every loop and experienced it as "asking confirmation again and
 * again"). Returns [] when the new draft's blocks are textually identical.
 */
export function chunkChangedReadback(prev: LetterDraft, next: LetterDraft, limit = TTS_CHUNK_LIMIT): string[] {
  const before = new Set(draftBlocks(prev));
  const changed = draftBlocks(next).filter((b) => !before.has(b));
  return changed.length === 0 ? [] : chunkBlocks(changed, limit);
}

export { assembleLetterText };
