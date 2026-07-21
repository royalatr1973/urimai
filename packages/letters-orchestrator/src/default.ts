/**
 * Production wiring: the letters orchestrator bound to real Redis, the DB letter-type
 * catalogue, the Claude classifier/extractor/drafter, and the draft/approval audit
 * sinks. The only file that knows the concrete services; orchestrator.ts stays pure.
 */
import { getRedis } from "@urimai/cache";
import {
  listLatestGrievanceCategories,
  listLatestLetterTypes,
  listLatestOffices,
  saveLetterApproval,
  saveLetterDraft,
} from "@urimai/db";
import { pickCcOffices, pickToOffice } from "@urimai/letter-types";
import { classifyLetter, extractLetterFacts, searchAddressee } from "@urimai/letters-extractor";
import { draftLetter } from "@urimai/letters-drafter";
import type { OfficeAddress } from "@urimai/types";
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
    // Classification also picks the curator grievance category (300-way) — its
    // escalation chain then decides the To/CC designations below.
    classify: async (text, types) => {
      const categories = await listLatestGrievanceCategories();
      return classifyLetter(text, types, {}, categories.map((c) => c.id));
    },
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
    // Addressee resolution — runs only for parts the user answered "தெரியலை" to.
    // Precedence per part: curator grievance-category chain decides the DESIGNATION;
    // web search (official domains) finds that designation's postal address for the
    // user's place; failing that, the designation prints with the user's place; the
    // state-office directory is the last resort.
    resolveAddressee: async (type, facts, need, categoryId) => {
      if (!need.to && !need.cc) return { to: null, cc: [] };
      const categories = await listLatestGrievanceCategories();
      const cat = categoryId ? categories.find((c) => c.id === categoryId) ?? null : null;
      const found = await searchAddressee(type, facts, {
        targetTo: cat?.to,
        targetCc: cat && cat.cc.length > 0 ? [cat.cc[0]!] : undefined,
      }); // never throws; nulls on failure
      const offices = await listLatestOffices();
      const place = facts.incident_place ?? facts.sender_address ?? null;

      let to: OfficeAddress | null = null;
      if (need.to) {
        to =
          found.to ??
          (cat ? { designationTamil: cat.to, addressLines: place ? [place] : ["________"], pincode: null } : null) ??
          pickToOffice(offices, type.id);
      }

      let cc: OfficeAddress[] = [];
      if (need.cc) {
        if (found.cc.length > 0) cc = found.cc;
        else if (cat && cat.cc.length > 0) cc = [{ designationTamil: cat.cc[0]!, addressLines: [], pincode: null }];
        else cc = pickCcOffices(offices, type.id, pickToOffice(offices, type.id)?.id ?? undefined);
        cc = cc.slice(0, 2);
      }
      return { to, cc };
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
