/**
 * LetterDraft → .docx. Structure is deterministic (same fixed block order as the text
 * and HTML renderers). Word documents reference fonts by name rather than embedding
 * them, so the default run font is "Nirmala UI" — present on every Windows machine
 * since 8 (where CSC operators and offices open these files) and shapes Tamil
 * correctly; "Noto Sans Tamil"/"Latha" are sensible manual swaps elsewhere.
 */
import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
import type { LetterDraft } from "@urimai/types";
import { letterLabels } from "./text.js";

const para = (
  text: string,
  opts: { bold?: boolean; after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
) =>
  new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.after ?? 0 },
    children: [new TextRun({ text, bold: opts.bold })],
  });

/** A multi-line block (sender/addressee/signature) as one paragraph per line. */
const block = (
  text: string,
  opts: { after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
) => {
  const lines = text.split("\n");
  return lines.map((line, i) => para(line, { after: i === lines.length - 1 ? (opts.after ?? 240) : 0, align: opts.align }));
};

export function buildLetterDocument(draft: LetterDraft): Document {
  const L = letterLabels(draft.language);
  return new Document({
    styles: {
      default: {
        document: { run: { font: "Nirmala UI", size: 24 } }, // 24 half-points = 12pt
      },
    },
    sections: [
      {
        children: [
          para(L.from, { bold: true }),
          ...block(draft.senderBlock),
          para(L.to, { bold: true }),
          ...block(draft.addresseeBlock),
          para(`${L.date} ${draft.date}`, { after: 240 }),
          para(`${L.subject} ${draft.subject}`, { bold: true, after: 240 }),
          para(draft.salutation, { after: 240 }),
          ...draft.bodyParagraphs.map((p) => para(p, { after: 240, align: AlignmentType.JUSTIFIED })),
          para(draft.closing, { after: 600 }),
          ...block(draft.signatureLine, { align: AlignmentType.RIGHT, after: draft.copyTo || draft.disclaimer ? 480 : 0 }),
          ...(draft.copyTo ? block(`${L.copyTo} ${draft.copyTo}`, { after: 240 }) : []),
          ...(draft.disclaimer ? [para(draft.disclaimer, { after: 0 })] : []),
        ],
      },
    ],
  });
}

/** Render the draft to .docx bytes, ready to send as a WhatsApp document. */
export function draftToDocx(draft: LetterDraft): Promise<Buffer> {
  return Packer.toBuffer(buildLetterDocument(draft));
}
