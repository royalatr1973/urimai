/**
 * The conversation orchestrator — the channel-agnostic brain.
 *
 * It knows NOTHING about WhatsApp, the web app, IVR, voice notes, OGG, or phone numbers.
 * Input is a session id + normalized text. Output is a normalized step: "ask this next
 * question" or "here are the verdicts". Channels normalize into this shape and render the
 * result; if anything channel-specific shows up here, it belongs back in the channel layer.
 *
 * Per turn it: runs extraction, merges into the stored profile, evaluates all schemes via
 * the deterministic engine, and decides the next step — ask the single highest-value
 * missing question, or deliver results. A question is asked ONLY for a field that actually
 * affects an unresolved in-scope scheme (the engine's missingFields), so there are no
 * dead-end questions.
 */
import { EMPTY_PROFILE, type Profile, type Scheme, type Verdict } from "@urimai/types";
import { evaluate } from "@urimai/engine";
import { QUESTIONS, FIELD_PRIORITY, type Question } from "./questions.js";

/** Minimal session-store contract (satisfied by ioredis; faked in tests). */
export interface SessionStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

/** What an evaluation hands to the audit sink (no PII — profile is discovery facts only). */
export interface AuditEntry {
  sessionId: string;
  profile: Profile;
  verdicts: Verdict[];
}

export interface OrchestratorDeps {
  /** Where conversation profiles are persisted (Redis in production). */
  store: SessionStore;
  /** Free text → Profile. Injected so the LLM call is swappable/testable. */
  extract: (text: string) => Promise<Profile>;
  /** Source of the in-scope schemes (the versioned DB rows at runtime). */
  loadSchemes: () => Promise<Scheme[]>;
  /** Immutable audit sink — called after EVERY evaluation. Injected; the engine stays pure. */
  audit?: (entry: AuditEntry) => Promise<void>;
  /** Session TTL in seconds (default 1 day). */
  ttlSeconds?: number;
}

/** A normalized turn result the channel layer renders however it likes. */
export type TurnResult =
  | {
      kind: "question";
      field: keyof Profile;
      question: Question; // { en, ta }
      verdicts: Verdict[]; // current verdicts so far (all need_info / partial)
      profile: Profile;
    }
  | {
      kind: "results";
      verdicts: Verdict[];
      profile: Profile;
    };

const DEFAULT_TTL = 60 * 60 * 24;
const sessionKey = (id: string) => `urimai:session:${id}`;

/**
 * Merge a freshly-extracted profile over the stored one: a new non-null value updates the
 * stored value; nulls never erase what we already know.
 */
export function mergeProfiles(base: Profile, update: Profile): Profile {
  const out: Profile = { ...base };
  for (const key of Object.keys(update) as (keyof Profile)[]) {
    const value = update[key];
    if (value !== null && value !== undefined) {
      (out as Record<keyof Profile, unknown>)[key] = value;
    }
  }
  return out;
}

/** Pick the missing field that unblocks the most schemes; tie-break by FIELD_PRIORITY. */
function pickField(counts: Map<keyof Profile, number>): keyof Profile {
  let best: keyof Profile | null = null;
  let bestCount = -1;
  let bestPriority = Number.MAX_SAFE_INTEGER;

  for (const [field, count] of counts) {
    const idx = FIELD_PRIORITY.indexOf(field);
    const priority = idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
    if (count > bestCount || (count === bestCount && priority < bestPriority)) {
      best = field;
      bestCount = count;
      bestPriority = priority;
    }
  }
  // counts is non-empty when this is called, so best is set.
  return best as keyof Profile;
}

/** A profile plus the verdict for every in-scope scheme — the dashboard shape. */
export type Assessment = { profile: Profile; verdicts: Verdict[] };

/** Pure: evaluate one profile against every scheme. */
export function evaluateProfile(profile: Profile, schemes: Scheme[]): Verdict[] {
  return schemes.map((s) => evaluate(profile, s));
}

/**
 * Pure decision step: evaluate every scheme and decide what to do next. Exposed for
 * direct testing without any IO.
 */
export function decideNext(profile: Profile, schemes: Scheme[]): TurnResult {
  const verdicts = evaluateProfile(profile, schemes);

  // Count how many unresolved schemes each missing field would help. Because the engine
  // only lists a field as missing when one of that scheme's rules references it and the
  // scheme isn't already resolved, every counted field is genuinely decision-relevant.
  const counts = new Map<keyof Profile, number>();
  for (const v of verdicts) {
    if (v.status !== "need_info") continue;
    for (const field of v.missingFields) {
      counts.set(field, (counts.get(field) ?? 0) + 1);
    }
  }

  if (counts.size === 0) {
    return { kind: "results", verdicts, profile };
  }

  const field = pickField(counts);
  return { kind: "question", field, question: QUESTIONS[field], verdicts, profile };
}

/** Create an orchestrator bound to its dependencies. */
export function createOrchestrator(deps: OrchestratorDeps) {
  const ttl = deps.ttlSeconds ?? DEFAULT_TTL;

  async function loadProfile(sessionId: string): Promise<Profile> {
    const raw = await deps.store.get(sessionKey(sessionId));
    if (!raw) return { ...EMPTY_PROFILE };
    try {
      return { ...EMPTY_PROFILE, ...(JSON.parse(raw) as Partial<Profile>) };
    } catch {
      return { ...EMPTY_PROFILE };
    }
  }

  async function saveProfile(sessionId: string, profile: Profile): Promise<void> {
    await deps.store.set(sessionKey(sessionId), JSON.stringify(profile), "EX", ttl);
  }

  /**
   * Drive one conversation turn for a session given new normalized user text.
   */
  async function handleTurn(sessionId: string, text: string): Promise<TurnResult> {
    const stored = await loadProfile(sessionId);
    const extracted = await deps.extract(text);
    const profile = mergeProfiles(stored, extracted);
    await saveProfile(sessionId, profile);

    const schemes = await deps.loadSchemes();
    const result = decideNext(profile, schemes);
    await deps.audit?.({ sessionId, profile, verdicts: result.verdicts });
    return result;
  }

  /**
   * Dashboard path (web channel): extract from new text, merge into the stored profile,
   * and return the merged profile plus ALL verdicts in one call — no next-question picker.
   */
  async function assess(sessionId: string, text: string): Promise<Assessment> {
    const stored = await loadProfile(sessionId);
    const extracted = await deps.extract(text);
    const profile = mergeProfiles(stored, extracted);
    await saveProfile(sessionId, profile);
    const schemes = await deps.loadSchemes();
    const verdicts = evaluateProfile(profile, schemes);
    await deps.audit?.({ sessionId, profile, verdicts });
    return { profile, verdicts };
  }

  /**
   * Re-evaluate an operator-edited profile server-side (NO LLM). The edited profile is
   * authoritative — it overwrites the stored one, so clearing a field actually clears it.
   * This is the debounced path behind the dashboard's editable fact fields; the rules
   * engine stays on the server, so the audit trail stays complete and rules stay single-source.
   */
  async function reassess(sessionId: string, profile: Profile): Promise<Assessment> {
    await saveProfile(sessionId, profile);
    const schemes = await deps.loadSchemes();
    const verdicts = evaluateProfile(profile, schemes);
    await deps.audit?.({ sessionId, profile, verdicts });
    return { profile, verdicts };
  }

  /**
   * Forget everything known about a session. Critical for shared phones: one WhatsApp
   * number often serves many beneficiaries (an operator, an SHG leader), and profiles must
   * never merge across people. Channels expose this as a "new person" command.
   */
  async function resetSession(sessionId: string): Promise<void> {
    await deps.store.del(sessionKey(sessionId));
  }

  return { handleTurn, assess, reassess, resetSession, loadProfile, saveProfile };
}

export type Orchestrator = ReturnType<typeof createOrchestrator>;
