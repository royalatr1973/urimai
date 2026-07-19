/**
 * Test doubles for the letters orchestrator: an in-memory store and scriptable
 * classify/extract/draft dependencies — the whole conversation runs with zero I/O.
 */
import type { LetterDraft, LetterFacts, LetterType } from "@urimai/types";
import { SEED_LETTER_TYPES } from "@urimai/letter-types";
import type { LettersOrchestratorDeps, SessionStore } from "../src/orchestrator.js";

export function memoryStore(): SessionStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: async (k) => map.get(k) ?? null,
    set: async (k, v) => void map.set(k, v),
    del: async (k) => void map.delete(k),
  };
}

export const emptyFacts = (): LetterFacts => ({ letterTypeId: null, language: null });

/** A deterministic fake drafter: body = the collected facts, verbatim. */
export function fakeDraft(type: LetterType, facts: LetterFacts, correctionNote?: string): LetterDraft {
  return {
    letterTypeId: type.id,
    typeVersion: type.version,
    senderBlock: facts.sender_name ?? "________",
    date: "19-07-2026",
    addresseeBlock: facts.addressee_office ?? "office",
    subject: type.nameTamil,
    salutation: "ஐயா,",
    bodyParagraphs: [facts.incident_details ?? "________", ...(correctionNote ? [correctionNote] : [])],
    closing: "நன்றி.",
    signatureLine: `இப்படிக்கு,\n${facts.sender_name ?? "________"}`,
    copyTo: facts.copy_to ?? null,
    disclaimer: "AI உதவியுடன் உருவாக்கப்பட்டது.",
    language: "ta",
  };
}

export interface FakeDeps {
  deps: LettersOrchestratorDeps;
  store: ReturnType<typeof memoryStore>;
  calls: { classify: string[]; extract: Array<{ text: string; pendingFact: string | null }>; draft: number };
  drafts: Array<{ revision: number; draftHash: string }>;
  approvals: Array<{ draftId: string | null; approvalUtterance: string; revisions: number }>;
  /** Script the next extraction result(s); consumed in order, then empty facts. */
  queueExtract: (...facts: Partial<LetterFacts>[]) => void;
}

export function makeFakeDeps(classifyAs = "police_complaint"): FakeDeps {
  const store = memoryStore();
  const extractQueue: Partial<LetterFacts>[] = [];
  const calls: FakeDeps["calls"] = { classify: [], extract: [], draft: 0 };
  const drafts: FakeDeps["drafts"] = [];
  const approvals: FakeDeps["approvals"] = [];
  let draftSeq = 0;

  const deps: LettersOrchestratorDeps = {
    store,
    loadTypes: async () => SEED_LETTER_TYPES,
    classify: async (text) => {
      calls.classify.push(text);
      return { letterTypeId: classifyAs, language: null };
    },
    extract: async (text, pendingFact) => {
      calls.extract.push({ text, pendingFact });
      const scripted = extractQueue.shift() ?? {};
      return { ...emptyFacts(), ...scripted };
    },
    draft: async (type, facts, req) => {
      calls.draft += 1;
      return fakeDraft(type, facts, req.correction ? `[திருத்தம்: ${req.correction.instruction}]` : undefined);
    },
    logDraft: async (input) => {
      drafts.push({ revision: input.revision, draftHash: input.draftHash });
      return `draft-${++draftSeq}`;
    },
    logApproval: async (input) => {
      approvals.push({ draftId: input.draftId, approvalUtterance: input.approvalUtterance, revisions: input.revisions });
    },
  };

  return { deps, store, calls, drafts, approvals, queueExtract: (...f) => extractQueue.push(...f) };
}
