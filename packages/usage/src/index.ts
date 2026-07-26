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
  // Claude (exact — from each response's usage)
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  calls: number;
  // Sarvam voice (estimated — Sarvam returns no usage, so measured from what we send it)
  ttsChars: number; // characters synthesized (TTS)
  sttSeconds: number; // seconds of audio transcribed (STT)
  ttsCalls: number;
  sttCalls: number;
}

export const EMPTY_USAGE: LlmUsage = {
  inputTokens: 0,
  outputTokens: 0,
  webSearches: 0,
  calls: 0,
  ttsChars: 0,
  sttSeconds: 0,
  ttsCalls: 0,
  sttCalls: 0,
};

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

/** Add one Sarvam call's usage (TTS characters or STT audio-seconds) to the session total. */
export function recordSarvamUsage(u: { ttsChars?: number; sttSeconds?: number }): void {
  const sessionId = ctx.getStore()?.sessionId;
  if (!sessionId) return;
  const cur = meter.get(sessionId) ?? { ...EMPTY_USAGE };
  if (u.ttsChars) {
    cur.ttsChars += u.ttsChars;
    cur.ttsCalls += 1;
  }
  if (u.sttSeconds) {
    cur.sttSeconds += u.sttSeconds;
    cur.sttCalls += 1;
  }
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
  sarvamTtsPerMillionChars: number; // USD per 1M TTS characters — set from your Sarvam plan
  sarvamSttPerMinute: number; // USD per minute of STT audio — set from your Sarvam plan
}

/**
 * Defaults: Claude Opus 4.8 list price + web search; INR at a rough spot rate.
 * Sarvam rates default to 0 (unconfigured) — Sarvam publishes no per-call cost, so the
 * operator must enter their real plan rate via SARVAM_* env. Until then usage volume
 * (chars/seconds) still shows; only the ₹ estimate is zero.
 */
export const DEFAULT_RATES: CostRates = {
  inputPerMillion: 5,
  outputPerMillion: 25,
  perWebSearch: 0.01,
  usdToInr: 86,
  sarvamTtsPerMillionChars: 0,
  sarvamSttPerMinute: 0,
};

export interface Cost {
  usd: number;
  inr: number;
}

export interface CostBreakdown {
  claude: Cost;
  sarvam: Cost; // ESTIMATE (0 until Sarvam rates are configured)
  total: Cost;
}

function claudeUsd(u: LlmUsage, r: CostRates): number {
  return (
    (u.inputTokens / 1_000_000) * r.inputPerMillion +
    (u.outputTokens / 1_000_000) * r.outputPerMillion +
    u.webSearches * r.perWebSearch
  );
}
function sarvamUsd(u: LlmUsage, r: CostRates): number {
  return (u.ttsChars / 1_000_000) * r.sarvamTtsPerMillionChars + (u.sttSeconds / 60) * r.sarvamSttPerMinute;
}

/** Total cost (Claude exact + Sarvam estimate). */
export function computeCost(u: LlmUsage, rates: Partial<CostRates> = {}): Cost {
  const r = { ...DEFAULT_RATES, ...rates };
  const usd = claudeUsd(u, r) + sarvamUsd(u, r);
  return { usd, inr: usd * r.usdToInr };
}

/** Cost split into Claude (exact) and Sarvam (estimate), plus the total. */
export function costBreakdown(u: LlmUsage, rates: Partial<CostRates> = {}): CostBreakdown {
  const r = { ...DEFAULT_RATES, ...rates };
  const c = claudeUsd(u, r);
  const s = sarvamUsd(u, r);
  return {
    claude: { usd: c, inr: c * r.usdToInr },
    sarvam: { usd: s, inr: s * r.usdToInr },
    total: { usd: c + s, inr: (c + s) * r.usdToInr },
  };
}

/** Read rate overrides from the environment (all optional; falls back to DEFAULT_RATES). */
export function ratesFromEnv(env: Record<string, string | undefined> = process.env): Partial<CostRates> {
  const num = (v: string | undefined) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const out: Partial<CostRates> = {};
  const inp = num(env.LLM_INPUT_PER_M);
  const outp = num(env.LLM_OUTPUT_PER_M);
  const ws = num(env.LLM_PER_WEB_SEARCH);
  const inr = num(env.USD_INR);
  const stts = num(env.SARVAM_STT_PER_MIN);
  const ttsc = num(env.SARVAM_TTS_PER_M_CHARS);
  if (inp !== undefined) out.inputPerMillion = inp;
  if (outp !== undefined) out.outputPerMillion = outp;
  if (ws !== undefined) out.perWebSearch = ws;
  if (inr !== undefined) out.usdToInr = inr;
  if (stts !== undefined) out.sarvamSttPerMinute = stts;
  if (ttsc !== undefined) out.sarvamTtsPerMillionChars = ttsc;
  return out;
}

/** Estimate seconds of audio in a 16 kHz mono 16-bit PCM WAV buffer (Sarvam STT input). */
export function estimateWavSeconds(wav: Buffer | Uint8Array): number {
  const bytes = wav.length > 44 ? wav.length - 44 : 0; // drop the WAV header
  return bytes / (16000 * 2); // 16k samples/s × 2 bytes/sample (mono)
}
