/**
 * The facts-only enforcement (LETTERS_BRIEF §2.2, §9) — deterministic checks on the
 * LLM-authored body, because a prompt is a request and this is a guarantee:
 *
 *  1. NUMBERS: every digit-run (2+ digits) in the body must appear in some collected
 *     fact. An invented FIR number, date, or amount fails the draft.
 *  2. CITATIONS: statute-reference patterns (Section/பிரிவு/Act 2005/IPC/...) in the
 *     body fail the draft — citations enter ONLY via the skeleton's subject line,
 *     verbatim from the LetterType record.
 *
 * A failed body is REPLACED by the deterministic fallback built from the user's own
 * words (fallback.ts) — the user is never blocked, and never shown invented content.
 */
import type { LetterFacts } from "@urimai/types";
import { FACT_KEYS } from "@urimai/types";

export interface GuardVerdict {
  ok: boolean;
  violations: string[];
}

const CITATION_PATTERNS: RegExp[] = [
  /\bsection\s*\d+/i,
  /\bsec\.\s*\d+/i,
  /§/,
  /பிரிவு\s*\d+/,
  /சட்டம்.{0,20}\d{4}/, // "…சட்டம் 2005"-style act references
  /\bact\b.{0,20}\b(19|20)\d{2}\b/i,
  /\b(ipc|crpc|bnss|bns)\b/i,
];

/** All digit-runs (2+ digits) present in the collected facts or the user's transcript. */
function allowedDigitRuns(facts: LetterFacts, userWords?: string): Set<string> {
  const runs = new Set<string>();
  for (const key of FACT_KEYS) {
    const v = facts[key];
    if (typeof v !== "string") continue;
    for (const m of v.matchAll(/\d{2,}/g)) runs.add(m[0]);
  }
  if (userWords) {
    for (const m of userWords.matchAll(/\d{2,}/g)) runs.add(m[0]);
  }
  return runs;
}

/**
 * Check LLM-authored paragraphs against everything the user actually said (structured
 * facts + verbatim transcript). Pure and deterministic — unit-testable without a model.
 */
export function checkBodyAgainstFacts(paragraphs: string[], facts: LetterFacts, userWords?: string): GuardVerdict {
  const violations: string[] = [];
  const allowed = allowedDigitRuns(facts, userWords);
  const body = paragraphs.join("\n");

  for (const m of body.matchAll(/\d{2,}/g)) {
    // A body number is legitimate only if some fact contains that exact run, or the run
    // is part of a longer fact run (e.g. fact "9876543210" quoted in full covers "9876").
    const run = m[0];
    const ok = [...allowed].some((a) => a.includes(run));
    if (!ok) violations.push(`invented number "${run}"`);
  }

  for (const p of CITATION_PATTERNS) {
    const m = body.match(p);
    if (m) violations.push(`citation-like text "${m[0]}" (citations come only from the LetterType record)`);
  }

  return { ok: violations.length === 0, violations };
}
