/**
 * The letters conversation orchestrator — the channel-agnostic Madal brain (§7 steps
 * 2–6). It knows NOTHING about WhatsApp, voice notes, or documents. Input: session id +
 * normalized text. Output: a normalized step the channel renders (listen / confirm the
 * type / ask one fact / read back / approved / escalate).
 *
 * Safety invariants owned here:
 *  - No draft is final without EXPLICIT approval; the approval utterance is logged (§2.1).
 *  - Corrections loop until approval, capped at REVISION_CAP, then escalation (§7.6).
 *  - Every draft revision and the approval are persisted via injected sinks (§2.7).
 *  - The gap loop asks ONE question at a time and never re-asks known facts (§7.4).
 */
import type { FactKey, LetterDraft, LetterFacts, LetterType } from "@urimai/types";
import { missingRequiredFacts, resolveLanguage, resolveLetterType } from "@urimai/letter-types";
import { draftHash } from "@urimai/docgen";
import type { Classification } from "@urimai/letters-extractor";
import { classifyReviewReply, isDontKnow, isNo, isYes } from "./intents.js";
import { chunkChangedReadback, chunkReadback } from "./readback.js";
import {
  CHANGED_INTRO,
  CLARIFY_PROMPT,
  confirmTypePrompt,
  LISTEN_PROMPT,
  NO_CHANGE_NEEDED,
  QUESTIONS,
  READBACK_PROMPT,
  type LetterQuestion,
} from "./questions.js";

/** Minimal session-store contract (satisfied by ioredis; faked in tests). */
export interface SessionStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export interface DraftRequest {
  /** Read-back correction context; absent on the first draft. */
  correction?: { instruction: string; previousBody: string[] };
  language: LetterType["languageDefault"];
}

export interface LettersOrchestratorDeps {
  store: SessionStore;
  /** The live letter-type catalogue (versioned DB rows at runtime). */
  loadTypes: () => Promise<LetterType[]>;
  /** Narration → letter type (LLM call 1). Injected; swappable/testable. */
  classify: (text: string, types: LetterType[]) => Promise<Classification>;
  /** Narration → facts (LLM call 2). `pendingFact` = the fact just asked about. */
  extract: (text: string, pendingFact: FactKey | null) => Promise<LetterFacts>;
  /** Type + facts → draft (LLM call 3 inside, guarded). Injected; swappable/testable. */
  draft: (type: LetterType, facts: LetterFacts, req: DraftRequest) => Promise<LetterDraft>;
  /** Persist one draft revision; returns a draft id for the approval record. */
  logDraft?: (input: { sessionId: string; draft: LetterDraft; revision: number; draftHash: string }) => Promise<string>;
  /** Persist the explicit approval — REQUIRED before any channel delivers documents. */
  logApproval?: (input: {
    sessionId: string;
    draftId: string | null;
    draftHash: string;
    approvalUtterance: string;
    revisions: number;
  }) => Promise<unknown>;
  ttlSeconds?: number;
  /** Correction rounds before offering a human (§7.6). */
  revisionCap?: number;
}

export type LetterTurnResult =
  | { kind: "listen"; prompt: LetterQuestion }
  | { kind: "confirm_type"; typeId: string; prompt: LetterQuestion; facts: LetterFacts }
  | { kind: "question"; fact: FactKey; question: LetterQuestion; typeId: string; facts: LetterFacts }
  | {
      kind: "readback";
      draft: LetterDraft;
      chunks: string[];
      revisions: number;
      prompt: LetterQuestion;
      /** true after a correction: chunks carry only the changed part, not the whole letter. */
      changedOnly: boolean;
    }
  | { kind: "clarify"; prompt: LetterQuestion; revisions: number }
  | { kind: "approved"; draft: LetterDraft; draftHash: string; revisions: number; approvalUtterance: string }
  | { kind: "escalate"; reason: "revision_cap"; revisions: number };

const DEFAULT_TTL = 60 * 60 * 24;
const DEFAULT_REVISION_CAP = 5;
const sessionKey = (id: string) => `madal:session:${id}`;

type Phase = "listening" | "confirming" | "collecting" | "reviewing";

interface SessionState {
  phase: Phase;
  /** Full narration so far — voice notes concatenate across turns (§7.2). */
  transcript: string;
  typeId: string | null;
  facts: LetterFacts;
  pendingFact: FactKey | null;
  /** Facts the user said they don't know — never re-asked; rendered as blanks. */
  skipped: FactKey[];
  revisions: number;
  draft: LetterDraft | null;
  draftId: string | null;
}

const EMPTY_STATE: SessionState = {
  phase: "listening",
  transcript: "",
  typeId: null,
  facts: { letterTypeId: null, language: null },
  pendingFact: null,
  skipped: [],
  revisions: 0,
  draft: null,
  draftId: null,
};

function decodeState(raw: string | null): SessionState {
  if (!raw) return structuredClone(EMPTY_STATE);
  try {
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    return { ...structuredClone(EMPTY_STATE), ...parsed, facts: { ...EMPTY_STATE.facts, ...(parsed.facts ?? {}) } };
  } catch {
    return structuredClone(EMPTY_STATE);
  }
}

/** Merge newly-extracted facts over stored ones; empty extraction never erases. */
export function mergeFacts(base: LetterFacts, update: LetterFacts): LetterFacts {
  const out: LetterFacts = { ...base };
  for (const [key, value] of Object.entries(update)) {
    if (value !== null && value !== undefined && value !== "") {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

export function createLettersOrchestrator(deps: LettersOrchestratorDeps) {
  const ttl = deps.ttlSeconds ?? DEFAULT_TTL;
  const cap = deps.revisionCap ?? DEFAULT_REVISION_CAP;

  const load = async (id: string) => decodeState(await deps.store.get(sessionKey(id)));
  const save = async (id: string, s: SessionState) => deps.store.set(sessionKey(id), JSON.stringify(s), "EX", ttl);

  /**
   * Produce (and log) a draft, move to reviewing, and build the read-back result.
   * With `prevDraft` set (a correction), only the CHANGED blocks are read back (§7.6).
   */
  async function produceDraft(
    sessionId: string,
    state: SessionState,
    type: LetterType,
    correction?: { instruction: string; previousBody: string[] },
    prevDraft?: LetterDraft,
  ): Promise<LetterTurnResult> {
    const language = resolveLanguage(type, state.facts);
    const draft = await deps.draft(type, state.facts, { correction, language });
    const hash = draftHash(draft);
    const draftId = deps.logDraft
      ? await deps.logDraft({ sessionId, draft, revision: state.revisions, draftHash: hash })
      : null;
    const next: SessionState = { ...state, phase: "reviewing", pendingFact: null, draft, draftId };
    await save(sessionId, next);

    if (prevDraft) {
      const changed = chunkChangedReadback(prevDraft, draft);
      const chunks = changed.length > 0 ? [CHANGED_INTRO.ta, ...changed] : [NO_CHANGE_NEEDED.ta];
      return { kind: "readback", draft, chunks, revisions: next.revisions, prompt: READBACK_PROMPT, changedOnly: true };
    }
    return { kind: "readback", draft, chunks: chunkReadback(draft), revisions: next.revisions, prompt: READBACK_PROMPT, changedOnly: false };
  }

  /** Gap loop step: ask the next missing required fact, or draft when complete (§7.4–7.5). */
  async function collectOrDraft(sessionId: string, state: SessionState, type: LetterType): Promise<LetterTurnResult> {
    const missing = missingRequiredFacts(type, state.facts).filter((f) => !state.skipped.includes(f));
    if (missing.length === 0) return produceDraft(sessionId, state, type);

    const fact = missing[0]!;
    const next: SessionState = { ...state, phase: "collecting", pendingFact: fact };
    await save(sessionId, next);
    return { kind: "question", fact, question: QUESTIONS[fact], typeId: type.id, facts: next.facts };
  }

  async function handleTurn(sessionId: string, text: string): Promise<LetterTurnResult> {
    const state = await load(sessionId);
    const types = await deps.loadTypes();

    // --- read-back phase: approve / correct / clarify (§7.6) ------------------
    if (state.phase === "reviewing" && state.draft) {
      const reply = classifyReviewReply(text);

      if (reply === "approve") {
        const hash = draftHash(state.draft);
        await deps.logApproval?.({
          sessionId,
          draftId: state.draftId,
          draftHash: hash,
          approvalUtterance: text,
          revisions: state.revisions,
        });
        const result: LetterTurnResult = {
          kind: "approved",
          draft: state.draft,
          draftHash: hash,
          revisions: state.revisions,
          approvalUtterance: text,
        };
        await deps.store.del(sessionKey(sessionId)); // done — next contact starts fresh
        return result;
      }

      // Neither a clear yes nor a stated change: ask, don't guess (§2.1). No re-draft,
      // no revision burnt, no re-read — one short question.
      if (reply === "unclear") {
        return { kind: "clarify", prompt: CLARIFY_PROMPT, revisions: state.revisions };
      }

      // A correction. Cap first: endless loops exhaust trust — offer a human (§7.6).
      if (state.revisions + 1 > cap) {
        return { kind: "escalate", reason: "revision_cap", revisions: state.revisions };
      }
      const extracted = await deps.extract(text, null);
      const withNew: SessionState = {
        ...state,
        facts: mergeFacts(state.facts, extracted),
        revisions: state.revisions + 1,
      };
      const type = resolveLetterType(types, withNew.typeId);
      if (!type) throw new Error("letter-type catalogue is empty — cannot draft");
      return produceDraft(
        sessionId,
        withNew,
        type,
        { instruction: text, previousBody: state.draft.bodyParagraphs },
        state.draft,
      );
    }

    // --- narration / gap phases ----------------------------------------------
    const transcript = state.transcript ? `${state.transcript}\n${text}` : text;

    // Type confirmation reply (§7.3): yes → keep; no → the generic fallback (never
    // turn the user away; a wrong specific template is worse than the safe generic).
    if (state.phase === "confirming") {
      let typeId = state.typeId;
      let extra: LetterFacts = { letterTypeId: null, language: null };
      if (isNo(text)) {
        typeId = resolveLetterType(types, null)?.id ?? typeId;
      } else if (!isYes(text)) {
        // Not a bare yes/no — treat as more narration: keep the type, mine the text.
        extra = await deps.extract(text, null);
      }
      const next: SessionState = {
        ...state,
        phase: "collecting",
        transcript,
        typeId,
        facts: mergeFacts(state.facts, extra),
      };
      const type = resolveLetterType(types, typeId);
      if (!type) throw new Error("letter-type catalogue is empty — cannot proceed");
      return collectOrDraft(sessionId, next, type);
    }

    // Gap-loop answer: "I don't know" skips the asked fact (blank in the letter, §7.4);
    // anything else goes through extraction with the pending fact as context.
    if (state.phase === "collecting" && state.pendingFact && isDontKnow(text)) {
      const next: SessionState = {
        ...state,
        transcript,
        skipped: [...state.skipped, state.pendingFact],
        pendingFact: null,
      };
      const type = resolveLetterType(types, next.typeId);
      if (!type) throw new Error("letter-type catalogue is empty — cannot proceed");
      return collectOrDraft(sessionId, next, type);
    }

    const extracted = await deps.extract(text, state.pendingFact);
    const facts = mergeFacts(state.facts, extracted);

    // First narration: classify (§7.3) and ask for confirmation in plain words.
    if (!state.typeId) {
      const cls = await deps.classify(transcript, types);
      const type = resolveLetterType(types, cls.letterTypeId);
      if (!type) throw new Error("letter-type catalogue is empty — cannot classify");
      const next: SessionState = {
        ...state,
        phase: "confirming",
        transcript,
        typeId: type.id,
        facts: mergeFacts(facts, { letterTypeId: type.id, language: cls.language }),
        pendingFact: null,
      };
      await save(sessionId, next);
      return {
        kind: "confirm_type",
        typeId: type.id,
        prompt: confirmTypePrompt(type.nameTamil, type.nameEnglish),
        facts: next.facts,
      };
    }

    const next: SessionState = { ...state, transcript, facts, pendingFact: null };
    const type = resolveLetterType(types, next.typeId);
    if (!type) throw new Error("letter-type catalogue is empty — cannot proceed");
    return collectOrDraft(sessionId, next, type);
  }

  /** Fresh conversation, no user text yet: the §7.2 listen prompt. */
  async function startSession(sessionId: string): Promise<LetterTurnResult> {
    await save(sessionId, structuredClone(EMPTY_STATE));
    return { kind: "listen", prompt: LISTEN_PROMPT };
  }

  async function resetSession(sessionId: string): Promise<void> {
    await deps.store.del(sessionKey(sessionId));
  }

  async function isNewSession(sessionId: string): Promise<boolean> {
    const s = await load(sessionId);
    return s.transcript.length === 0 && s.phase === "listening";
  }

  return { handleTurn, startSession, resetSession, isNewSession };
}

export type LettersOrchestrator = ReturnType<typeof createLettersOrchestrator>;
