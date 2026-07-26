/**
 * Admin-portal reads (July 2026): the dashboard summary, the letters list, and one
 * letter's detail. A "letter" is a distinct APPROVED DRAFT — identified by the draft id
 * an approval references — NOT the session. One phone (sessionId) reuses its session
 * across many letters, so keying by session would collapse them into one row; keying by
 * the approved draft gives one row per delivered letter, which is what an operator wants.
 *
 * Read-only aggregates over letter_drafts / letter_approvals / letter_feedback /
 * escalations — no writes, no PII decryption (the API gates access with the operator
 * token and the UI masks the phone). Volumes are small in this phase, so grouping and
 * the feedback-to-letter windowing are done in JS; revisit if the tables grow large.
 */
import type { LetterDraft } from "@urimai/types";
import { costBreakdown, EMPTY_USAGE, ratesFromEnv, type CostBreakdown, type LlmUsage } from "@urimai/usage";
import { getPrisma } from "./client.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Usage + Claude/Sarvam/total cost of a stored llmUsage blob at the current (env) rates. */
function costOf(usage: unknown): { usage: LlmUsage; cost: CostBreakdown } {
  const u = { ...EMPTY_USAGE, ...((usage ?? {}) as Partial<LlmUsage>) };
  return { usage: u, cost: costBreakdown(u, ratesFromEnv()) };
}

interface DeliveredLetter {
  draftId: string;
  sessionId: string;
  approvedAt: Date;
  revisions: number;
}

type FeedbackRow = {
  sessionId: string;
  categoryKey: string | null;
  createdAt: Date;
  sentiment: string;
  rating: number | null;
  text: string;
};

/** One delivered letter per distinct approved draft (a letter can have >1 approval row). */
async function deliveredLetters(): Promise<DeliveredLetter[]> {
  const approvals = await getPrisma().letterApproval.findMany({ orderBy: { approvedAt: "desc" } });
  const byDraft = new Map<string, DeliveredLetter>();
  for (const a of approvals) {
    const cur = byDraft.get(a.draftId);
    if (!cur || a.approvedAt.getTime() > cur.approvedAt.getTime()) {
      byDraft.set(a.draftId, { draftId: a.draftId, sessionId: a.sessionId, approvedAt: a.approvedAt, revisions: a.revisions });
    }
  }
  return [...byDraft.values()].sort((x, y) => y.approvedAt.getTime() - x.approvedAt.getTime());
}

/**
 * Feedback rows key only by session, but a session holds many letters — so assign each
 * feedback to the letter whose approval-time window [approvedAt, nextApprovedAt) contains
 * it (feedback is given right after a letter's final approval). Returns draftId → its feedback.
 */
function matchFeedbackToLetters(letters: DeliveredLetter[], feedback: FeedbackRow[]): Map<string, FeedbackRow[]> {
  const bySession = new Map<string, DeliveredLetter[]>();
  for (const L of letters) {
    const arr = bySession.get(L.sessionId) ?? [];
    arr.push(L);
    bySession.set(L.sessionId, arr);
  }
  for (const arr of bySession.values()) arr.sort((a, b) => a.approvedAt.getTime() - b.approvedAt.getTime());

  const out = new Map<string, FeedbackRow[]>();
  for (const f of feedback) {
    const arr = bySession.get(f.sessionId);
    if (!arr) continue;
    for (let i = 0; i < arr.length; i++) {
      const start = arr[i]!.approvedAt.getTime();
      const end = i + 1 < arr.length ? arr[i + 1]!.approvedAt.getTime() : Infinity;
      if (f.createdAt.getTime() >= start && f.createdAt.getTime() < end) {
        const list = out.get(arr[i]!.draftId) ?? [];
        list.push(f);
        out.set(arr[i]!.draftId, list);
        break;
      }
    }
  }
  for (const arr of out.values()) arr.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return out;
}

export interface AdminSummary {
  deliveredTotal: number;
  deliveredLast7d: number;
  feedback: { count: number; avgRating: number | null; positive: number; neutral: number; negative: number };
  negativeLast7d: number;
  pendingEscalations: number;
  highRevision: number; // delivered letters that took >= 3 correction loops
  unmatchedCategory: number; // delivered letters that matched no grievance category
  topCategories: Array<{ category: string; count: number }>;
  spend: {
    claude: { usd: number; inr: number };
    sarvam: { usd: number; inr: number }; // estimate (0 until Sarvam rates configured)
    total: { usd: number; inr: number };
  };
  avgCostPerLetter: { usd: number; inr: number }; // total ÷ delivered
}

export async function getAdminSummary(now: Date = new Date()): Promise<AdminSummary> {
  const p = getPrisma();
  const all = await deliveredLetters();
  const cutoff = new Date(now.getTime() - 7 * DAY_MS);

  const draftRows = await p.letterDraft.findMany({ where: { id: { in: all.map((L) => L.draftId) } } });
  const draftById = new Map(draftRows.map((d) => [d.id, d]));
  const sessionIds = [...new Set(all.map((L) => L.sessionId))];
  const feedbackRows = (await p.letterFeedback.findMany({ where: { sessionId: { in: sessionIds } } })) as FeedbackRow[];
  const fbByDraft = matchFeedbackToLetters(all, feedbackRows);

  let deliveredLast7d = 0;
  let highRevision = 0;
  let unmatchedCategory = 0;
  let claudeUsd = 0;
  let sarvamUsd = 0;
  const catCounts = new Map<string, number>();
  for (const L of all) {
    if (L.approvedAt >= cutoff) deliveredLast7d += 1;
    if (L.revisions >= 3) highRevision += 1;
    const cb = costOf(draftById.get(L.draftId)?.llmUsage).cost;
    claudeUsd += cb.claude.usd;
    sarvamUsd += cb.sarvam.usd;
    const cat = draftById.get(L.draftId)?.categoryKey ?? fbByDraft.get(L.draftId)?.[0]?.categoryKey ?? null;
    if (!cat) unmatchedCategory += 1;
    else catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
  }
  const inr = ratesFromEnv().usdToInr ?? 86;
  const totalUsd = claudeUsd + sarvamUsd;
  const spend = {
    claude: { usd: claudeUsd, inr: claudeUsd * inr },
    sarvam: { usd: sarvamUsd, inr: sarvamUsd * inr },
    total: { usd: totalUsd, inr: totalUsd * inr },
  };
  const avgUsd = all.length > 0 ? totalUsd / all.length : 0;
  const avgCostPerLetter = { usd: avgUsd, inr: avgUsd * inr };
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
    deliveredTotal: all.length,
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
    spend,
    avgCostPerLetter,
  };
}

export interface AdminLetterRow {
  id: string; // the approved draft id — the letter's stable identifier
  sessionId: string; // carries the phone; UI masks it
  deliveredAt: Date;
  revisions: number;
  letterType: string | null;
  category: string | null; // null = matched no grievance category (fell to generic)
  subject: string | null;
  rating: number | null;
  sentiment: string | null;
  hasFeedback: boolean;
  cost: { usd: number; inr: number }; // total (Claude exact + Sarvam estimate) for this letter
}

export async function listAdminLetters(opts: { limit?: number; offset?: number } = {}): Promise<{
  total: number;
  letters: AdminLetterRow[];
}> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const all = await deliveredLetters();
  const page = all.slice(offset, offset + limit);

  const draftRows = await getPrisma().letterDraft.findMany({ where: { id: { in: page.map((L) => L.draftId) } } });
  const draftById = new Map(draftRows.map((d) => [d.id, d]));
  const sessionIds = [...new Set(all.map((L) => L.sessionId))];
  const feedbackRows = (await getPrisma().letterFeedback.findMany({ where: { sessionId: { in: sessionIds } } })) as FeedbackRow[];
  const fbByDraft = matchFeedbackToLetters(all, feedbackRows);

  const letters = page.map((L): AdminLetterRow => {
    const d = draftById.get(L.draftId);
    const f = fbByDraft.get(L.draftId)?.[0] ?? null;
    const draftJson = (d?.draft ?? null) as LetterDraft | null;
    return {
      id: L.draftId,
      sessionId: L.sessionId,
      deliveredAt: L.approvedAt,
      revisions: L.revisions,
      letterType: d?.letterTypeKey ?? null,
      category: d?.categoryKey ?? f?.categoryKey ?? null,
      subject: draftJson?.subject ?? null,
      rating: f?.rating ?? null,
      sentiment: f?.sentiment ?? null,
      hasFeedback: Boolean(f),
      cost: costOf(d?.llmUsage).cost.total,
    };
  });
  return { total: all.length, letters };
}

export interface AdminLetterDetail {
  id: string;
  sessionId: string;
  letterType: string | null;
  category: string | null;
  revisions: number;
  transcript: string | null; // what the citizen told Madal (null for letters drafted before capture)
  dialogue: Array<{ q: string; a: string }> | null; // full Q&A (null for letters drafted before capture)
  usage: LlmUsage; // Claude tokens + Sarvam chars/seconds for this letter
  cost: CostBreakdown; // Claude (exact) + Sarvam (estimate) + total, at current rates
  draft: LetterDraft | null; // the full letter (for text + document regeneration)
  approvals: Array<{ approvedAt: Date; approvalUtterance: string; revisions: number; draftHash: string }>;
  feedback: Array<{ createdAt: Date; sentiment: string; rating: number | null; text: string }>;
}

/** One letter's full record, keyed by the approved draft id. Callers should audit this read. */
export async function getAdminLetter(letterId: string): Promise<AdminLetterDetail | null> {
  const p = getPrisma();
  const draft = await p.letterDraft.findUnique({ where: { id: letterId } });
  if (!draft) return null;
  const approvals = await p.letterApproval.findMany({ where: { draftId: letterId }, orderBy: { approvedAt: "desc" } });

  const all = await deliveredLetters();
  const sessionFeedback = (await p.letterFeedback.findMany({ where: { sessionId: draft.sessionId } })) as FeedbackRow[];
  const matched = matchFeedbackToLetters(
    all.filter((L) => L.sessionId === draft.sessionId),
    sessionFeedback,
  ).get(letterId) ?? [];

  return {
    id: letterId,
    sessionId: draft.sessionId,
    letterType: draft.letterTypeKey,
    category: draft.categoryKey ?? matched[0]?.categoryKey ?? null,
    revisions: approvals[0]?.revisions ?? draft.revision,
    transcript: draft.transcript ?? null,
    dialogue: (draft.dialogue ?? null) as Array<{ q: string; a: string }> | null,
    usage: costOf(draft.llmUsage).usage,
    cost: costOf(draft.llmUsage).cost,
    draft: (draft.draft ?? null) as LetterDraft | null,
    approvals: approvals.map((a) => ({
      approvedAt: a.approvedAt,
      approvalUtterance: a.approvalUtterance,
      revisions: a.revisions,
      draftHash: a.draftHash,
    })),
    feedback: matched.map((f) => ({ createdAt: f.createdAt, sentiment: f.sentiment, rating: f.rating, text: f.text })),
  };
}
