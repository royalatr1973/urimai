/**
 * Draft + approval persistence (LETTERS_BRIEF §2.7: every draft and approval is logged).
 * Drafts contain PII; encryption at rest and the 30-day retention sweep arrive in Madal
 * Phase 6 — the audit contract (nothing delivered without a logged approval) starts now.
 */
import type { LetterDraft } from "@urimai/types";
import { getPrisma } from "./client.js";

export interface DraftLogInput {
  sessionId: string;
  draft: LetterDraft;
  revision: number;
  draftHash: string;
  /** Grievance category chosen at classify (300-way); null when it fell to the generic petition. */
  categoryKey?: string | null;
  /** The citizen's accumulated narration that produced this draft (PII); null if unavailable. */
  transcript?: string | null;
}

/** Persist one draft revision; returns the row id (referenced by the approval). */
export async function saveLetterDraft(input: DraftLogInput): Promise<string> {
  const row = await getPrisma().letterDraft.create({
    data: {
      sessionId: input.sessionId,
      letterTypeKey: input.draft.letterTypeId,
      categoryKey: input.categoryKey ?? null,
      typeVersion: input.draft.typeVersion,
      revision: input.revision,
      language: input.draft.language,
      transcript: input.transcript ?? null,
      draft: input.draft as unknown as object,
      draftHash: input.draftHash,
    },
  });
  return row.id;
}

export interface ApprovalLogInput {
  sessionId: string;
  draftId: string;
  draftHash: string;
  approvalUtterance: string;
  revisions: number;
}

/** Persist the user's explicit approval — the precondition for any delivery. */
export async function saveLetterApproval(input: ApprovalLogInput): Promise<string> {
  const row = await getPrisma().letterApproval.create({
    data: {
      sessionId: input.sessionId,
      draftId: input.draftId,
      draftHash: input.draftHash,
      approvalUtterance: input.approvalUtterance,
      revisions: input.revisions,
    },
  });
  return row.id;
}

export interface FeedbackLogInput {
  sessionId: string;
  letterTypeKey: string | null;
  categoryKey: string | null;
  revisions: number;
  sentiment: string;
  rating: number | null;
  text: string;
}

/** Persist one letter's end-of-session user feedback. */
export async function saveLetterFeedback(input: FeedbackLogInput): Promise<string> {
  const row = await getPrisma().letterFeedback.create({
    data: {
      sessionId: input.sessionId,
      letterTypeKey: input.letterTypeKey,
      categoryKey: input.categoryKey,
      revisions: input.revisions,
      sentiment: input.sentiment,
      rating: input.rating,
      text: input.text,
    },
  });
  return row.id;
}
