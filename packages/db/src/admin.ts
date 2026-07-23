/**
 * Admin-portal reads (July 2026): the dashboard summary, the letters list, and one
 * letter's detail. A "letter" is a distinct session that reached a logged approval
 * (i.e. was delivered). These are read-only aggregates over letter_drafts /
 * letter_approvals / letter_feedback / escalations — no writes, no PII decryption
 * (the sessionId carries the phone; the API gates access with the operator token and
 * the UI masks it). Volumes are small in this phase, so grouping is done in JS rather
 * than SQL window functions; revisit if the tables grow large.
 */
import type { LetterDraft } from "@urimai/types";
import { getPrisma } from "./client.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AdminSummary {
  deliveredTotal: number;
  deliveredLast7d: number;
  feedback: { count: number; avgRating: number | null; positive: number; neutral: number; negative: number };
  negativeLast7d: number;
  pendingEscalations: number;
  highRevision: number; // delivered letters that took >= 3 correction loops
  unmatchedCategory: number; // delivered letters that matched no grievance category
  topCategories: Array<{ category: string; count: number }>;
}

/** Latest approval per session = the set of delivered letters. */
async function deliveredSessions(): Promise<Map<string, { approvedAt: Date; revisions: number }>> {
  const approvals = await getPrisma().letterApproval.findMany({ orderBy: { approvedAt: "desc" } });
  const latest = new Map<string, { approvedAt: Date; revisions: number }>();
  for (const a of approvals) {
    if (!latest.has(a.sessionId)) latest.set(a.sessionId, { approvedAt: a.approvedAt, revisions: a.revisions });
  }
  return latest;
}

/** Latest draft per session (carries letterTypeKey, categoryKey, and the full letter JSON). */
async function latestDraftsFor(sessionIds: string[]) {
  const drafts = await getPrisma().letterDraft.findMany({
    where: { sessionId: { in: sessionIds } },
    orderBy: { revision: "desc" },
  });
  const by = new Map<string, (typeof drafts)[number]>();
  for (const d of drafts) if (!by.has(d.sessionId)) by.set(d.sessionId, d);
  return by;
}

export async function getAdminSummary(now: Date = new Date()): Promise<AdminSummary> {
  const p = getPrisma();
  const delivered = await deliveredSessions();
  const sessionIds = [...delivered.keys()];
  const cutoff = new Date(now.getTime() - 7 * DAY_MS);

  const drafts = await latestDraftsFor(sessionIds);
  // Category fallback to feedback for drafts logged before categoryKey existed — matches
  // the list view, so the dashboard counts and the table agree.
  const fbCats = await p.letterFeedback.findMany({
    where: { sessionId: { in: sessionIds }, categoryKey: { not: null } },
    select: { sessionId: true, categoryKey: true },
    orderBy: { createdAt: "desc" },
  });
  const fbCatBy = new Map<string, string>();
  for (const f of fbCats) if (f.categoryKey && !fbCatBy.has(f.sessionId)) fbCatBy.set(f.sessionId, f.categoryKey);

  let deliveredLast7d = 0;
  let highRevision = 0;
  let unmatchedCategory = 0;
  const catCounts = new Map<string, number>();
  for (const [sid, info] of delivered) {
    if (info.approvedAt >= cutoff) deliveredLast7d += 1;
    if (info.revisions >= 3) highRevision += 1;
    const cat = drafts.get(sid)?.categoryKey ?? fbCatBy.get(sid) ?? null;
    if (!cat) unmatchedCategory += 1;
    else catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
  }
  const topCategories = [...catCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const [fbCount, ratingAgg, sentiments, negRecent, pendingEscalations] = await Promise.all([
    p.letterFeedback.count(),
    p.letterFeedback.aggregate({ _avg: { rating: true } }),
    p.letterFeedback.groupBy({ by: ["sentiment"], _count: { _all: true } }),
    p.letterFeedback.count({ where: { sentiment: "negative", createdAt: { gte: cutoff } } }),
    p.escalation.count({ where: { status: "pending" } }),
  ]);
  const sentimentCount = (s: string) => sentiments.find((r) => r.sentiment === s)?._count._all ?? 0;

  return {
    deliveredTotal: delivered.size,
    deliveredLast7d,
    feedback: {
      count: fbCount,
      avgRating: ratingAgg._avg.rating ?? null,
      positive: sentimentCount("positive"),
      neutral: sentimentCount("neutral"),
      negative: sentimentCount("negative"),
    },
    negativeLast7d: negRecent,
    pendingEscalations,
    highRevision,
    unmatchedCategory,
    topCategories,
  };
}

export interface AdminLetterRow {
  sessionId: string;
  deliveredAt: Date;
  revisions: number;
  letterType: string | null;
  category: string | null; // null = matched no grievance category (fell to generic)
  subject: string | null;
  rating: number | null;
  sentiment: string | null;
  hasFeedback: boolean;
}

export async function listAdminLetters(opts: { limit?: number; offset?: number } = {}): Promise<{
  total: number;
  letters: AdminLetterRow[];
}> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const delivered = await deliveredSessions();
  const ordered = [...delivered.entries()].sort((a, b) => b[1].approvedAt.getTime() - a[1].approvedAt.getTime());
  const page = ordered.slice(offset, offset + limit);
  const ids = page.map(([sid]) => sid);

  const drafts = await latestDraftsFor(ids);
  const feedback = await getPrisma().letterFeedback.findMany({
    where: { sessionId: { in: ids } },
    orderBy: { createdAt: "desc" },
  });
  const fbBy = new Map<string, (typeof feedback)[number]>();
  for (const f of feedback) if (!fbBy.has(f.sessionId)) fbBy.set(f.sessionId, f);

  const letters = page.map(([sessionId, info]): AdminLetterRow => {
    const d = drafts.get(sessionId);
    const f = fbBy.get(sessionId);
    const draftJson = (d?.draft ?? null) as LetterDraft | null;
    return {
      sessionId,
      deliveredAt: info.approvedAt,
      revisions: info.revisions,
      letterType: d?.letterTypeKey ?? null,
      category: d?.categoryKey ?? f?.categoryKey ?? null,
      subject: draftJson?.subject ?? null,
      rating: f?.rating ?? null,
      sentiment: f?.sentiment ?? null,
      hasFeedback: Boolean(f),
    };
  });
  return { total: delivered.size, letters };
}

export interface AdminLetterDetail {
  sessionId: string;
  letterType: string | null;
  category: string | null;
  revisions: number;
  draft: LetterDraft | null; // the full letter (for text + document regeneration)
  approvals: Array<{ approvedAt: Date; approvalUtterance: string; revisions: number; draftHash: string }>;
  feedback: Array<{ createdAt: Date; sentiment: string; rating: number | null; text: string }>;
}

/** One letter's full record. Callers should audit this read — it exposes letter content. */
export async function getAdminLetter(sessionId: string): Promise<AdminLetterDetail | null> {
  const p = getPrisma();
  const drafts = await p.letterDraft.findMany({ where: { sessionId }, orderBy: { revision: "desc" } });
  const approvals = await p.letterApproval.findMany({ where: { sessionId }, orderBy: { approvedAt: "desc" } });
  const feedback = await p.letterFeedback.findMany({ where: { sessionId }, orderBy: { createdAt: "desc" } });
  if (drafts.length === 0 && approvals.length === 0) return null;
  const top = drafts[0] ?? null;
  return {
    sessionId,
    letterType: top?.letterTypeKey ?? null,
    category: top?.categoryKey ?? feedback[0]?.categoryKey ?? null,
    revisions: approvals[0]?.revisions ?? top?.revision ?? 0,
    draft: (top?.draft ?? null) as LetterDraft | null,
    approvals: approvals.map((a) => ({
      approvedAt: a.approvedAt,
      approvalUtterance: a.approvalUtterance,
      revisions: a.revisions,
      draftHash: a.draftHash,
    })),
    feedback: feedback.map((f) => ({ createdAt: f.createdAt, sentiment: f.sentiment, rating: f.rating, text: f.text })),
  };
}
