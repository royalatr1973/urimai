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
import type { FactKey, LetterDraft, LetterFacts, LetterType, OfficeAddress } from "@urimai/types";
import { missingRequiredFacts, resolveLanguage, resolveLetterType } from "@urimai/letter-types";
import { draftHash } from "@urimai/docgen";
import { resetUsage, runWithUsageContext, snapshotUsage, type LlmUsage } from "@urimai/usage";
import type { Classification } from "@urimai/letters-extractor";
import { classifyFeedback } from "./feedback.js";
import { classifyReviewReply, isDontKnow, isNo, isNoNeed, isYes, parseLanguageChoice } from "./intents.js";
import { chunkChangedReadback, chunkReadback } from "./readback.js";
import {
  CHANGED_INTRO,
  CLARIFY_PROMPT,
  confirmTypePrompt,
  entityQuestion,
  LISTEN_PROMPT,
  NO_CHANGE_NEEDED,
  CLOSED_PROMPT,
  LANGUAGE_PROMPT,
  DELIVERED_REVIEW_PROMPT,
  FEEDBACK_PROMPT,
  POST_DELIVERY_CLARIFY,
  QUESTIONS,
  READBACK_PROMPT,
  REMOVED_NOTE,
  SPOKEN_DISCLAIMER,
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
  /** false after the user asked to drop the curated நகல் recipients. */
  includeCuratedCc: boolean;
  /** Resolved To office (web-found or directory); the user's stated addressee still wins. */
  toOffice?: OfficeAddress | null;
  /** Resolved CC offices — already gated by includeCuratedCc. */
  ccOffices?: OfficeAddress[];
  /**
   * EVERYTHING the user said this session, verbatim — the drafter may draw any detail
   * from it (their words, so the facts-only principle §2.2 holds), ensuring inputs
   * beyond the asked question are never lost.
   */
  transcript?: string;
  /** Category case data captured from the user (verbatim) — woven into the body. */
  entities?: Record<string, string>;
}

/** Resolved To/CC offices for one letter — computed once, reused across revisions. */
export interface ResolvedAddressee {
  to: OfficeAddress | null;
  cc: OfficeAddress[];
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
  /**
   * Resolve To/CC offices (web search with directory fallback in the default wiring).
   * Called ONCE per letter, before the first draft, and ONLY for the parts the user
   * said "தெரியலை" to (`need`) — a user-provided addressee is never second-guessed,
   * and a declined copy is never searched. Optional; failures tolerated.
   */
  resolveAddressee?: (
    type: LetterType,
    facts: LetterFacts,
    need: { to: boolean; cc: boolean },
    categoryId: string | null,
  ) => Promise<ResolvedAddressee>;
  /**
   * Case-data entities the classified grievance category requires (curator column).
   * Asked one at a time after the story facts; answers captured VERBATIM (no LLM
   * call — zero latency); "தெரியலை" skips. Optional.
   */
  getCategoryEntities?: (categoryId: string) => Promise<string[]>;
  /** Persist one draft revision; returns a draft id for the approval record. */
  logDraft?: (input: {
    sessionId: string;
    draft: LetterDraft;
    revision: number;
    draftHash: string;
    categoryKey: string | null;
    transcript: string | null;
    dialogue: Array<{ q: string; a: string }>;
    usage: LlmUsage;
  }) => Promise<string>;
  /** Persist the explicit approval — REQUIRED before any channel delivers documents. */
  logApproval?: (input: {
    sessionId: string;
    draftId: string | null;
    draftHash: string;
    approvalUtterance: string;
    revisions: number;
    /** Usage as of approval — later than the draft snapshot, so it includes the read-back TTS. */
    usage: LlmUsage;
  }) => Promise<unknown>;
  /** Persist the end-of-letter feedback ("how did you feel?"). Optional. */
  logFeedback?: (input: {
    sessionId: string;
    letterTypeKey: string | null;
    categoryKey: string | null;
    revisions: number;
    sentiment: string;
    rating: number | null;
    text: string;
  }) => Promise<unknown>;
  ttlSeconds?: number;
  /** Correction rounds before offering a human (§7.6). */
  revisionCap?: number;
  /** Ask the citizen to choose Tamil vs English for the letter (ASK_LETTER_LANGUAGE). */
  askLanguage?: boolean;
  /** Deliver the PDF directly, skipping the pre-delivery read-back/confirm (READBACK_STYLE=off). */
  skipReadback?: boolean;
}

export type LetterTurnResult =
  | { kind: "listen"; prompt: LetterQuestion }
  | { kind: "confirm_type"; typeId: string; prompt: LetterQuestion; facts: LetterFacts }
  /** Ask which language the letter should be written in (Tamil or English). */
  | { kind: "language_choice"; prompt: LetterQuestion }
  | { kind: "question"; fact: FactKey; question: LetterQuestion; typeId: string; facts: LetterFacts }
  | { kind: "entity_question"; entity: string; question: LetterQuestion; typeId: string; facts: LetterFacts }
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
  /** Send the PDF/Word documents, then WAIT for the user to review them (post-delivery). */
  | { kind: "deliver"; draft: LetterDraft; draftHash: string; revisions: number; prompt: LetterQuestion }
  /** Documents accepted — ask the user for feedback before closing. */
  | { kind: "feedback_request"; prompt: LetterQuestion }
  /** Feedback captured (or the letter is done) — close warmly. */
  | { kind: "closed"; prompt: LetterQuestion }
  | { kind: "escalate"; reason: "revision_cap"; revisions: number };

const DEFAULT_TTL = 60 * 60 * 24;
const DEFAULT_REVISION_CAP = 5;
const sessionKey = (id: string) => `madal:session:${id}`;

type Phase = "listening" | "confirming" | "choosing_language" | "collecting" | "reviewing" | "delivered" | "feedback";

interface SessionState {
  phase: Phase;
  /** Full narration so far — voice notes concatenate across turns (§7.2). */
  transcript: string;
  typeId: string | null;
  /** Curator grievance category chosen at classification; drives the To/CC chain. */
  categoryId: string | null;
  facts: LetterFacts;
  pendingFact: FactKey | null;
  /** The grievance entity just asked about (mutually exclusive with pendingFact). */
  pendingEntity: string | null;
  /** Facts the user said they don't know — never re-asked; rendered as blanks. */
  skipped: FactKey[];
  /** Entities the user said they don't know — never re-asked. */
  skippedEntities: string[];
  revisions: number;
  draft: LetterDraft | null;
  draftId: string | null;
  /** User said drop the curated நகல் recipients — stays off for this letter. */
  ccDisabled: boolean;
  /** To/CC offices resolved once for this letter; undefined = not yet attempted. */
  resolved?: ResolvedAddressee;
  /** Full turn-by-turn Q&A for the admin view — each Madal question + the citizen's reply. */
  dialogue: Array<{ q: string; a: string }>;
  /** What Madal spoke at the end of the previous turn (the question the next reply answers). */
  lastPrompt: string;
}

const EMPTY_STATE: SessionState = {
  phase: "listening",
  transcript: "",
  typeId: null,
  categoryId: null,
  facts: { letterTypeId: null, language: null },
  pendingFact: null,
  pendingEntity: null,
  skipped: [],
  skippedEntities: [],
  revisions: 0,
  draft: null,
  draftId: null,
  ccDisabled: false,
  dialogue: [],
  lastPrompt: "",
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

/**
 * Narrative facts ACCUMULATE across turns (live-tester feedback, July 2026: extra
 * detail the user volunteers while answering some other question must never be lost) —
 * a new value is appended to what we already know instead of replacing it.
 */
const NARRATIVE_KEYS = new Set<string>(["incident_details", "prior_attempts"]);

/** Merge newly-extracted facts over stored ones; empty extraction never erases. */
export function mergeFacts(base: LetterFacts, update: LetterFacts): LetterFacts {
  const out: LetterFacts = { ...base };
  for (const [key, value] of Object.entries(update)) {
    if (value === null || value === undefined || value === "") continue;
    const prev = (base as Record<string, unknown>)[key];
    if (NARRATIVE_KEYS.has(key) && typeof prev === "string" && typeof value === "string" && prev.length > 0) {
      // Already-known detail: keep the accumulated text (never shrink it).
      // New detail: append. Either way, nothing previously captured is lost.
      if (!prev.includes(value)) (out as Record<string, unknown>)[key] = `${prev} ${value}`;
    } else {
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
   * Resolve the addressee (once), draft the letter, log the revision, and save the
   * session in the given phase. Shared by the voice read-back path (→ reviewing) and
   * the post-delivery correction path (→ delivered).
   */
  async function resolveAndDraft(
    sessionId: string,
    state: SessionState,
    type: LetterType,
    phase: Phase,
    correction?: { instruction: string; previousBody: string[] },
  ): Promise<{ state: SessionState; draft: LetterDraft; hash: string }> {
    const language = resolveLanguage(type, state.facts);

    // Resolve To/CC ONCE per letter — and ONLY where the user said "தெரியலை"
    // (live-tester rule, July 2026: ask the user first; search only on don't-know).
    // A stated addressee is used as given; a declined copy ("வேண்டாம்") stays empty.
    if (state.resolved === undefined) {
      const userNamedTo = Boolean(state.facts.addressee_office || state.facts.addressee_name || state.facts.addressee_address);
      const need = {
        to: !userNamedTo && state.skipped.includes("addressee_office"),
        cc: !state.ccDisabled && !state.facts.copy_to && state.skipped.includes("copy_to"),
      };
      let resolved: ResolvedAddressee = { to: null, cc: [] };
      if ((need.to || need.cc) && deps.resolveAddressee) {
        try {
          resolved = await deps.resolveAddressee(type, state.facts, need, state.categoryId);
        } catch {
          /* tolerated — blanks/hints apply */
        }
      }
      state = { ...state, resolved };
    }

    const draft = await deps.draft(type, state.facts, {
      correction,
      language,
      includeCuratedCc: !state.ccDisabled,
      toOffice: state.resolved?.to ?? null,
      ccOffices: state.ccDisabled ? [] : state.resolved?.cc ?? [],
      transcript: state.transcript,
      entities: state.facts.entities,
    });
    const hash = draftHash(draft);
    const draftId = deps.logDraft
      ? await deps.logDraft({
          sessionId,
          draft,
          revision: state.revisions,
          draftHash: hash,
          categoryKey: state.categoryId,
          transcript: state.transcript || null,
          dialogue: state.dialogue,
          usage: snapshotUsage(sessionId),
        })
      : null;
    const next: SessionState = { ...state, phase, pendingFact: null, draft, draftId };
    await save(sessionId, next);
    return { state: next, draft, hash };
  }

  /**
   * Draft, move to reviewing, and build the voice read-back result. With `prevDraft`
   * set (a correction), only the CHANGED blocks are read back (§7.6).
   */
  async function produceDraft(
    sessionId: string,
    state: SessionState,
    type: LetterType,
    correction?: { instruction: string; previousBody: string[] },
    prevDraft?: LetterDraft,
  ): Promise<LetterTurnResult> {
    const { state: next, draft, hash } = await resolveAndDraft(sessionId, state, type, "reviewing", correction);

    if (prevDraft) {
      const changed = chunkChangedReadback(prevDraft, draft);
      const chunks =
        changed.length > 0
          ? [CHANGED_INTRO.ta, ...changed]
          : draftHash(prevDraft) !== hash
            ? [REMOVED_NOTE.ta] // text changed but nothing new to read — content was removed
            : [NO_CHANGE_NEEDED.ta];
      return { kind: "readback", draft, chunks, revisions: next.revisions, prompt: READBACK_PROMPT, changedOnly: true };
    }
    // Full read-back ends with the SPOKEN disclaimer — told to the user, never printed.
    const chunks = [...chunkReadback(draft), SPOKEN_DISCLAIMER.ta];
    return { kind: "readback", draft, chunks, revisions: next.revisions, prompt: READBACK_PROMPT, changedOnly: false };
  }

  /**
   * Draft and hand the letter straight to delivery + post-delivery review — used both for
   * the initial direct-deliver path (no correction) and for a post-delivery re-draft.
   */
  async function produceDelivery(
    sessionId: string,
    state: SessionState,
    type: LetterType,
    correction?: { instruction: string; previousBody: string[] },
  ): Promise<LetterTurnResult> {
    const { state: next, draft, hash } = await resolveAndDraft(sessionId, state, type, "delivered", correction);
    return { kind: "deliver", draft, draftHash: hash, revisions: next.revisions, prompt: DELIVERED_REVIEW_PROMPT };
  }

  /**
   * Gap loop step (§7.4–7.5), in the confirmed order: STORY facts first, then the
   * category's case-data ENTITIES, then addressee + copy, then draft.
   */
  async function collectOrDraft(sessionId: string, state: SessionState, type: LetterType): Promise<LetterTurnResult> {
    const missing = missingRequiredFacts(type, state.facts).filter((f) => !state.skipped.includes(f));
    const LAST: FactKey[] = ["addressee_office", "copy_to"];
    const story = missing.filter((f) => !LAST.includes(f));

    const askFact = async (fact: FactKey): Promise<LetterTurnResult> => {
      const next: SessionState = { ...state, phase: "collecting", pendingFact: fact, pendingEntity: null };
      await save(sessionId, next);
      return { kind: "question", fact, question: QUESTIONS[fact], typeId: type.id, facts: next.facts };
    };

    if (story.length > 0) return askFact(story[0]!);

    // Category case data — what THIS grievance needs (curator column).
    if (state.categoryId && deps.getCategoryEntities) {
      const required = await deps.getCategoryEntities(state.categoryId);
      const missingEntities = required.filter(
        (e) => !(state.facts.entities?.[e]) && !state.skippedEntities.includes(e),
      );
      if (missingEntities.length > 0) {
        const entity = missingEntities[0]!;
        const next: SessionState = { ...state, phase: "collecting", pendingFact: null, pendingEntity: entity };
        await save(sessionId, next);
        return { kind: "entity_question", entity, question: entityQuestion(entity), typeId: type.id, facts: next.facts };
      }
    }

    const last = missing.filter((f) => LAST.includes(f));
    if (last.length > 0) {
      // When a grievance category matched, its escalation chain already gives the To/CC —
      // don't make the citizen answer "who to send it to / who to copy". Auto-skip those
      // (so resolveAddressee fills them from the category) and go straight to the draft.
      // Only ask when NO category was found (generic petition — nothing to resolve from).
      if (state.categoryId) {
        state = { ...state, skipped: [...state.skipped, ...last] };
        await save(sessionId, state);
      } else {
        return askFact(last[0]!);
      }
    }

    // Direct-deliver (READBACK_STYLE=off): skip the pre-delivery summary/disclaimer/confirm
    // and hand over the PDF now — the post-delivery review is the checkpoint (and the AI
    // disclaimer is on the delivery caption). Otherwise draft → voice read-back.
    return deps.skipReadback ? produceDelivery(sessionId, state, type) : produceDraft(sessionId, state, type);
  }

  /** The Tamil text Madal speaks for a result — the "question" side of a dialogue turn. */
  function spokenTextOf(r: LetterTurnResult): string {
    if ("question" in r && r.question) return r.question.ta;
    if ("prompt" in r && r.prompt) return r.prompt.ta;
    return "";
  }

  /**
   * Public entry: records the full Q&A for the admin view around the real turn logic.
   * BEFORE processing we log (last question → this answer) so a draft logged this turn
   * already carries it; AFTER, we remember what we just asked. Recording is best-effort
   * — a store hiccup must never break the citizen's letter.
   */
  async function handleTurn(sessionId: string, text: string): Promise<LetterTurnResult> {
    try {
      const pre = await load(sessionId);
      pre.dialogue = [...pre.dialogue, { q: pre.lastPrompt, a: text }];
      await save(sessionId, pre);
    } catch {
      /* dialogue capture is non-essential — proceed with the turn */
    }
    const result = await runWithUsageContext(sessionId, () => runTurn(sessionId, text));
    if (result.kind !== "closed" && result.kind !== "escalate") {
      try {
        const post = await load(sessionId);
        post.lastPrompt = spokenTextOf(result);
        await save(sessionId, post);
      } catch {
        /* non-essential */
      }
    }
    return result;
  }

  async function runTurn(sessionId: string, text: string): Promise<LetterTurnResult> {
    const state = await load(sessionId);
    const types = await deps.loadTypes();

    // --- read-back phase: approve / correct / clarify (§7.6) ------------------
    if (state.phase === "reviewing" && state.draft) {
      // "நகல் வேண்டாம்" — dropping the curated CC is a stated change; detect it BEFORE
      // the classifier, whose bare-negative rule would otherwise send it to clarify.
      const dropCc = /நகல்|நகலை|copy|cc/i.test(text) && /வேண்டாம்|நீக்க|நீக்கு|இல்லாம|remove|drop/i.test(text);
      const reply = dropCc ? "correction" : classifyReviewReply(text);

      if (reply === "approve") {
        // Content approved by voice → log approval and DELIVER the documents. The
        // session stays open for a post-delivery review of the actual PDF (below).
        const hash = draftHash(state.draft);
        await deps.logApproval?.({
          sessionId,
          draftId: state.draftId,
          draftHash: hash,
          approvalUtterance: text,
          revisions: state.revisions,
          usage: snapshotUsage(sessionId),
        });
        await save(sessionId, { ...state, phase: "delivered" });
        return { kind: "deliver", draft: state.draft, draftHash: hash, revisions: state.revisions, prompt: DELIVERED_REVIEW_PROMPT };
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
        ccDisabled: state.ccDisabled || dropCc,
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

    // --- post-delivery review: the user has the PDF in hand -------------------
    // Wait for corrections. No correction (or a thanks) → close warmly. A correction
    // → redo the letter and deliver the new PDF, then wait again.
    if (state.phase === "delivered" && state.draft) {
      const dropCc = /நகல்|நகலை|copy|cc/i.test(text) && /வேண்டாம்|நீக்க|நீக்கு|இல்லாம|remove|drop/i.test(text);
      const reply = dropCc ? "correction" : classifyReviewReply(text);

      if (reply === "approve") {
        // No correction after seeing the documents — the definitive approval. Log it,
        // then ask for feedback before closing (one feedback per letter).
        const hash = draftHash(state.draft);
        await deps.logApproval?.({
          sessionId,
          draftId: state.draftId,
          draftHash: hash,
          approvalUtterance: text,
          revisions: state.revisions,
          usage: snapshotUsage(sessionId),
        });
        await save(sessionId, { ...state, phase: "feedback" });
        return { kind: "feedback_request", prompt: FEEDBACK_PROMPT };
      }

      if (reply === "unclear") {
        return { kind: "clarify", prompt: POST_DELIVERY_CLARIFY, revisions: state.revisions };
      }

      // A correction after delivery — redo and re-deliver (cap still applies).
      if (state.revisions + 1 > cap) {
        return { kind: "escalate", reason: "revision_cap", revisions: state.revisions };
      }
      const extracted = await deps.extract(text, null);
      const withNew: SessionState = {
        ...state,
        facts: mergeFacts(state.facts, extracted),
        revisions: state.revisions + 1,
        ccDisabled: state.ccDisabled || dropCc,
      };
      const type = resolveLetterType(types, withNew.typeId);
      if (!type) throw new Error("letter-type catalogue is empty — cannot draft");
      return produceDelivery(sessionId, withNew, type, {
        instruction: text,
        previousBody: state.draft.bodyParagraphs,
      });
    }

    // --- feedback: capture the user's reaction, then close (one per letter) ---
    if (state.phase === "feedback") {
      const { sentiment, rating } = classifyFeedback(text);
      await deps.logFeedback?.({
        sessionId,
        letterTypeKey: state.typeId,
        categoryKey: state.categoryId,
        revisions: state.revisions,
        sentiment,
        rating,
        text: text.trim(),
      });
      await deps.store.del(sessionKey(sessionId)); // done — next contact starts fresh
      resetUsage(sessionId); // letter finished — clear its cost meter
      return { kind: "closed", prompt: CLOSED_PROMPT };
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
      const merged = mergeFacts(state.facts, extra);
      // Optionally ask the letter's language (Tamil/English) once the type is set — unless
      // the citizen already made it clear in their narration (facts.language).
      if (deps.askLanguage && !merged.language) {
        await save(sessionId, { ...state, phase: "choosing_language", transcript, typeId, facts: merged });
        return { kind: "language_choice", prompt: LANGUAGE_PROMPT };
      }
      const next: SessionState = { ...state, phase: "collecting", transcript, typeId, facts: merged };
      const type = resolveLetterType(types, typeId);
      if (!type) throw new Error("letter-type catalogue is empty — cannot proceed");
      return collectOrDraft(sessionId, next, type);
    }

    // Language choice reply: set the letter language, then start collecting facts. An
    // unclear answer defaults to Tamil (the audience's language) rather than re-asking.
    if (state.phase === "choosing_language") {
      const lang = parseLanguageChoice(text) ?? "ta";
      const next: SessionState = {
        ...state,
        phase: "collecting",
        transcript,
        facts: { ...state.facts, language: lang },
      };
      const type = resolveLetterType(types, next.typeId);
      if (!type) throw new Error("letter-type catalogue is empty — cannot proceed");
      return collectOrDraft(sessionId, next, type);
    }

    // Entity answer: captured VERBATIM (no LLM call — instant); "தெரியலை" skips.
    // The reply also lands in the transcript, so the drafter loses nothing.
    if (state.phase === "collecting" && state.pendingEntity) {
      const entity = state.pendingEntity;
      const next: SessionState =
        isDontKnow(text) || isNoNeed(text)
          ? { ...state, transcript, skippedEntities: [...state.skippedEntities, entity], pendingEntity: null }
          : {
              ...state,
              transcript,
              facts: { ...state.facts, entities: { ...(state.facts.entities ?? {}), [entity]: text.trim() } },
              pendingEntity: null,
            };
      const type = resolveLetterType(types, next.typeId);
      if (!type) throw new Error("letter-type catalogue is empty — cannot proceed");
      return collectOrDraft(sessionId, next, type);
    }

    // Copy question: a whole-message "வேண்டாம்" means NO copy at all — no search,
    // no curated CC, nothing (distinct from "தெரியலை" = find one for me).
    if (state.phase === "collecting" && state.pendingFact === "copy_to" && isNoNeed(text)) {
      const next: SessionState = {
        ...state,
        transcript,
        ccDisabled: true,
        skipped: [...state.skipped, "copy_to"],
        pendingFact: null,
      };
      const type = resolveLetterType(types, next.typeId);
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
        categoryId: cls.categoryId ?? null,
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
    // Seed lastPrompt so the citizen's first reply is paired with the opening question.
    resetUsage(sessionId); // fresh letter — start its cost meter from zero
    await save(sessionId, { ...structuredClone(EMPTY_STATE), lastPrompt: LISTEN_PROMPT.ta });
    return { kind: "listen", prompt: LISTEN_PROMPT };
  }

  async function resetSession(sessionId: string): Promise<void> {
    resetUsage(sessionId);
    await deps.store.del(sessionKey(sessionId));
  }

  async function isNewSession(sessionId: string): Promise<boolean> {
    const s = await load(sessionId);
    return s.transcript.length === 0 && s.phase === "listening";
  }

  return { handleTurn, startSession, resetSession, isNewSession };
}

export type LettersOrchestrator = ReturnType<typeof createLettersOrchestrator>;
