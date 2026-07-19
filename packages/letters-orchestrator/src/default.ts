/**
 * Production wiring: the letters orchestrator bound to real Redis, the DB letter-type
 * catalogue, the Claude classifier/extractor/drafter, and the draft/approval audit
 * sinks. The only file that knows the concrete services; orchestrator.ts stays pure.
 */
import { getRedis } from "@urimai/cache";
import { listLatestLetterTypes, saveLetterApproval, saveLetterDraft } from "@urimai/db";
import { classifyLetter, extractLetterFacts } from "@urimai/letters-extractor";
import { draftLetter } from "@urimai/letters-drafter";
import { createLettersOrchestrator, type SessionStore } from "./orchestrator.js";

export interface DefaultLettersOrchestratorOptions {
  /** Session TTL override (e.g. shorter for shared-phone channels). */
  ttlSeconds?: number;
  revisionCap?: number;
}

export function createDefaultLettersOrchestrator(opts: DefaultLettersOrchestratorOptions = {}) {
  const redis = getRedis(); // REDIS_URL from env
  const store: SessionStore = {
    get: (key) => redis.get(key),
    set: (key, value, mode, ttl) => redis.set(key, value, mode, ttl),
    del: (key) => redis.del(key),
  };

  return createLettersOrchestrator({
    store,
    loadTypes: () => listLatestLetterTypes(),
    classify: (text, types) => classifyLetter(text, types),
    extract: (text, pendingFact) => extractLetterFacts(text, { pendingFact }),
    draft: (type, facts, req) =>
      draftLetter(type, facts, { language: req.language, correction: req.correction }).then((r) => r.draft),
    logDraft: (input) => saveLetterDraft(input),
    logApproval: (input) => {
      // logDraft above always runs first, so a missing draftId is a bug — fail loudly
      // rather than record an approval that references no draft.
      if (!input.draftId) throw new Error("approval without a logged draft id");
      return saveLetterApproval({ ...input, draftId: input.draftId });
    },
    ttlSeconds: opts.ttlSeconds,
    revisionCap: opts.revisionCap,
  });
}
