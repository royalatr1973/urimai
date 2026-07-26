/**
 * @urimai/usage — per-letter LLM cost metering (July 2026).
 *
 * The Claude calls that cost money (classify, extract, draft, addressee search) sit deep
 * inside the extractor/drafter, far from the sessionId. Rather than thread sessionId
 * through every signature, the orchestrator runs each turn inside an AsyncLocalStorage
 * context carrying the sessionId; the Claude helpers call recordAnthropicUsage() after
 * every response and it attributes the tokens to whichever letter is being processed.
 * The orchestrator snapshots the running total onto the draft, then clears it when the
 * letter ends. Cost is computed from the stored tokens at read time, so rate changes
 * apply retroactively.
 *
 * The meter is a process-local Map — it lives in the process that makes the Claude calls
 * (the WhatsApp server). The admin/API reads the PERSISTED tokens from the database, not
 * this Map, so nothing needs to be shared across processes.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  calls: number;
}

export const EMPTY_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0, webSearches: 0, calls: 0 };

const ctx = new AsyncLocalStorage<{ sessionId: string }>();
const meter = new Map<string, LlmUsage>();

/** Run `fn` (async) with a usage context so nested Claude calls attribute to this session. */
export function runWithUsageContext<T>(sessionId: string, fn: () => T): T {
  return ctx.run({ sessionId }, fn);
}

/** Add one call's usage to the current session's running total. No-op outside a context. */
export function recordUsage(u: { inputTokens?: number; outputTokens?: number; webSearches?: number }): void {
  const sessionId = ctx.getStore()?.sessionId;
  if (!sessionId) return; // called outside a metered turn (e.g. the schemes web flow) — ignore
  const cur = meter.get(sessionId) ?? { ...EMPTY_USAGE };
  cur.inputTokens += u.inputTokens ?? 0;
  cur.outputTokens += u.outputTokens ?? 0;
  cur.webSearches += u.webSearches ?? 0;
  cur.calls += 1;
  meter.set(sessionId, cur);
}

/** Convenience: record straight from an Anthropic message's `usage` object. */
export function recordAnthropicUsage(
  usage:
    | { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } | null }
    | null
    | undefined,
): void {
  if (!usage) return;
  recordUsage({
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    webSearches: usage.server_tool_use?.web_search_requests ?? 0,
  });
}

/** The running total for a session (a copy). */
export function snapshotUsage(sessionId: string): LlmUsage {
  return { ...(meter.get(sessionId) ?? EMPTY_USAGE) };
}

/** Clear a session's meter — call at letter start and completion so letters don't bleed together. */
export function resetUsage(sessionId: string): void {
  meter.delete(sessionId);
}

// --- cost -----------------------------------------------------------------

export interface CostRates {
  inputPerMillion: number; // USD per 1M input tokens
  outputPerMillion: number; // USD per 1M output tokens
  perWebSearch: number; // USD per web search request
  usdToInr: number;
}

/** Defaults: Claude Opus 4.8 list price + web search; INR at a rough spot rate. */
export const DEFAULT_RATES: CostRates = {
  inputPerMillion: 5,
  outputPerMillion: 25,
  perWebSearch: 0.01,
  usdToInr: 86,
};

export interface Cost {
  usd: number;
  inr: number;
}

export function computeCost(u: LlmUsage, rates: Partial<CostRates> = {}): Cost {
  const r = { ...DEFAULT_RATES, ...rates };
  const usd =
    (u.inputTokens / 1_000_000) * r.inputPerMillion +
    (u.outputTokens / 1_000_000) * r.outputPerMillion +
    u.webSearches * r.perWebSearch;
  return { usd, inr: usd * r.usdToInr };
}

/** Read rate overrides from the environment (all optional; falls back to DEFAULT_RATES). */
export function ratesFromEnv(env: Record<string, string | undefined> = process.env): Partial<CostRates> {
  const num = (v: string | undefined) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const out: Partial<CostRates> = {};
  const inp = num(env.LLM_INPUT_PER_M);
  const outp = num(env.LLM_OUTPUT_PER_M);
  const ws = num(env.LLM_PER_WEB_SEARCH);
  const inr = num(env.USD_INR);
  if (inp !== undefined) out.inputPerMillion = inp;
  if (outp !== undefined) out.outputPerMillion = outp;
  if (ws !== undefined) out.perWebSearch = ws;
  if (inr !== undefined) out.usdToInr = inr;
  return out;
}
