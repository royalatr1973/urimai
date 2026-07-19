/**
 * Deterministic letter assembly — the single textual form of a LetterDraft. This exact
 * text is what the read-back loop speaks, what gets hashed for the approval record, and
 * what the HTML/docx renderers lay out. One source of truth: if the spoken letter and
 * the printed letter ever diverged, the user would have approved something they never
 * heard (LETTERS_BRIEF §2.1).
 */
import { createHash } from "node:crypto";
import type { LetterDraft } from "@urimai/types";

export interface LetterLabels {
  from: string;
  to: string;
  date: string;
  subject: string;
  copyTo: string;
}

const LABELS: Record<LetterDraft["language"], LetterLabels> = {
  ta: { from: "அனுப்புநர்:", to: "பெறுநர்:", date: "நாள்:", subject: "பொருள்:", copyTo: "நகல்:" },
  en: { from: "From:", to: "To:", date: "Date:", subject: "Subject:", copyTo: "Copy to:" },
  bilingual: {
    from: "அனுப்புநர் / From:",
    to: "பெறுநர் / To:",
    date: "நாள் / Date:",
    subject: "பொருள் / Subject:",
    copyTo: "நகல் / Copy to:",
  },
};

/** The skeleton labels for a language — data + code, never LLM freeform (§2.3). */
export function letterLabels(language: LetterDraft["language"]): LetterLabels {
  return LABELS[language];
}

/** Assemble the full letter as plain text, in the fixed TN formal-letter order. */
export function assembleLetterText(draft: LetterDraft): string {
  const L = LABELS[draft.language];
  return [
    L.from,
    draft.senderBlock,
    "",
    L.to,
    draft.addresseeBlock,
    "",
    `${L.date} ${draft.date}`,
    "",
    `${L.subject} ${draft.subject}`,
    "",
    draft.salutation,
    "",
    ...draft.bodyParagraphs.flatMap((p) => [p, ""]),
    draft.closing,
    "",
    draft.signatureLine,
    ...(draft.copyTo ? ["", `${L.copyTo} ${draft.copyTo}`] : []),
    ...(draft.disclaimer ? ["", draft.disclaimer] : []),
  ].join("\n");
}

/** sha256 of the assembled text — logged in the ApprovalRecord (§2.7). */
export function draftHash(draft: LetterDraft): string {
  return createHash("sha256").update(assembleLetterText(draft), "utf8").digest("hex");
}
