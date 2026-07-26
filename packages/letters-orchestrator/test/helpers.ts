/**
 * Test doubles for the letters orchestrator: an in-memory store and scriptable
 * classify/extract/draft dependencies — the whole conversation runs with zero I/O.
 */
import type { LetterDraft, LetterFacts, LetterType } from "@urimai/types";
import { SEED_LETTER_TYPES } from "@urimai/letter-types";
import { recordUsage, type LlmUsage } from "@urimai/usage";
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
export function fakeDraft(
  type: LetterType,
  facts: LetterFacts,
  correctionNote?: string,
  ccNames: string[] = [],
  toOffice?: { designationTamil: string } | null,
): LetterDraft {
  const cc = [...(facts.copy_to ? [facts.copy_to] : []), ...ccNames];
  return {
    letterTypeId: type.id,
    typeVersion: type.version,
    senderBlock: facts.sender_name ?? "________",
    date: "19-07-2026",
    addresseeBlock: facts.addressee_office ?? toOffice?.designationTamil ?? "office",
    subject: type.nameTamil,
    salutation: "ஐயா,",
    bodyParagraphs: [facts.incident_details ?? "________", ...(correctionNote ? [correctionNote] : [])],
    closing: "நன்றி.",
    signatureLine: `இப்படிக்கு,\n${facts.sender_name ?? "________"}`,
    copyTo: cc.length > 0 ? cc.join("\n") : null,
    language: "ta",
  };
}

export interface FakeDeps {
  deps: LettersOrchestratorDeps;
  store: ReturnType<typeof memoryStore>;
  calls: { classify: string[]; extract: Array<{ text: string; pendingFact: string | null }>; draft: number; resolve: number };
  drafts: Array<{ revision: number; draftHash: string; dialogue: Array<{ q: string; a: string }>; usage: LlmUsage }>;
  approvals: Array<{ draftId: string | null; approvalUtterance: string; revisions: number }>;
  feedback: Array<{ sentiment: string; rating: number | null; text: string; categoryKey: string | null }>;
  /** Script the next extraction result(s); consumed in order, then empty facts. */
  queueExtract: (...facts: Partial<LetterFacts>[]) => void;
}

export function makeFakeDeps(classifyAs = "police_complaint", categoryId: string | null = "test_category"): FakeDeps {
  const store = memoryStore();
  const extractQueue: Partial<LetterFacts>[] = [];
  const calls: FakeDeps["calls"] = { classify: [], extract: [], draft: 0, resolve: 0 };
  const drafts: FakeDeps["drafts"] = [];
  const approvals: FakeDeps["approvals"] = [];
  const feedback: FakeDeps["feedback"] = [];
  let draftSeq = 0;

  const deps: LettersOrchestratorDeps = {
    store,
    loadTypes: async () => SEED_LETTER_TYPES,
    classify: async (text) => {
      calls.classify.push(text);
      return { letterTypeId: classifyAs, categoryId, language: null };
    },
    extract: async (text, pendingFact) => {
      calls.extract.push({ text, pendingFact });
      const scripted = extractQueue.shift() ?? {};
      return { ...emptyFacts(), ...scripted };
    },
    draft: async (type, facts, req) => {
      calls.draft += 1;
      // Simulate the real drafter's Claude spend so the usage meter has something to
      // accumulate — the orchestrator runs the turn inside a usage context.
      recordUsage({ inputTokens: 800, outputTokens: 300 });
      // A CC-only instruction leaves the body untouched (like the real drafter, which
      // is told to apply ONLY the requested change).
      const note =
        req.correction && !/நகல்/.test(req.correction.instruction)
          ? `[திருத்தம்: ${req.correction.instruction}]`
          : undefined;
      return fakeDraft(type, facts, note, (req.ccOffices ?? []).map((o) => o.designationTamil), req.toOffice);
    },
    resolveAddressee: async (_type, _facts, need, _categoryId) => {
      calls.resolve += 1;
      return {
        to: need.to ? { designationTamil: "தேடல்-அலுவலகம்", addressLines: ["Found St", "Chennai"], pincode: "600001" } : null,
        cc: need.cc ? [{ designationTamil: "நகல்-அலுவலகம் (search)", addressLines: ["HQ", "Chennai"], pincode: "600002" }] : [],
      };
    },
    logDraft: async (input) => {
      drafts.push({ revision: input.revision, draftHash: input.draftHash, dialogue: input.dialogue, usage: input.usage });
      return `draft-${++draftSeq}`;
    },
    logApproval: async (input) => {
      approvals.push({ draftId: input.draftId, approvalUtterance: input.approvalUtterance, revisions: input.revisions });
    },
    logFeedback: async (input) => {
      feedback.push({ sentiment: input.sentiment, rating: input.rating, text: input.text, categoryKey: input.categoryKey });
    },
  };

  return { deps, store, calls, drafts, approvals, feedback, queueExtract: (...f) => extractQueue.push(...f) };
}
