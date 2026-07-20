/**
 * Production wiring: the letters orchestrator bound to real Redis, the DB letter-type
 * catalogue, the Claude classifier/extractor/drafter, and the draft/approval audit
 * sinks. The only file that knows the concrete services; orchestrator.ts stays pure.
 */
import { getRedis } from "@urimai/cache";
import { listLatestLetterTypes, listLatestOffices, saveLetterApproval, saveLetterDraft } from "@urimai/db";
import { pickCcOffices, pickToOffice } from "@urimai/letter-types";
import { classifyLetter, extractLetterFacts, searchAddressee } from "@urimai/letters-extractor";
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
    draft: async (type, facts, req) => {
      const r = await draftLetter(type, facts, {
        language: req.language,
        correction: req.correction,
        toOffice: req.toOffice,
        ccOffices: req.ccOffices ?? [],
        transcript: req.transcript,
      });
      return r.draft;
    },
    // Addressee resolution (user decision, July 2026): WEB SEARCH of official gov.in
    // sources first, curator directory as the fallback when search finds nothing
    // usable. The user's own stated addressee always wins inside the drafter.
    resolveAddressee: async (type, facts) => {
      const userNamedAddressee = Boolean(facts.addressee_name || facts.addressee_office || facts.addressee_address);
      const found = await searchAddressee(type, facts); // never throws; nulls on failure
      const offices = await listLatestOffices();
      const to = userNamedAddressee ? null : found.to ?? pickToOffice(offices, type.id);
      const toKey = found.to ? undefined : (pickToOffice(offices, type.id)?.id ?? undefined);
      const cc = found.cc.length > 0 ? found.cc : pickCcOffices(offices, type.id, toKey);
      return { to, cc: cc.slice(0, 2) };
    },
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
