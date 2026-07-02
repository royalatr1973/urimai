/**
 * Production wiring: the channel-agnostic orchestrator bound to real Redis, the DB scheme
 * source, the Claude extractor, and the immutable audit sink. The connection string comes
 * from REDIS_URL via @urimai/cache — never hardcoded. This is the only file that knows about
 * those concrete services; the core (orchestrator.ts) stays pure and channel-agnostic.
 */
import { getRedis } from "@urimai/cache";
import { listLatestSchemes, writeAudit } from "@urimai/db";
import { extractProfile } from "@urimai/extractor";
import { createOrchestrator, type SessionStore } from "./orchestrator.js";

export interface DefaultOrchestratorOptions {
  /** Channel label recorded in the audit log (e.g. "web", "whatsapp"). */
  channel?: string;
}

export function createDefaultOrchestrator(opts: DefaultOrchestratorOptions = {}) {
  const redis = getRedis(); // reads REDIS_URL from env
  const store: SessionStore = {
    get: (key) => redis.get(key),
    set: (key, value, mode, ttl) => redis.set(key, value, mode, ttl),
  };

  return createOrchestrator({
    store,
    extract: (text) => extractProfile(text),
    loadSchemes: () => listLatestSchemes(),
    // Every evaluation is logged immutably, tagged with the channel.
    audit: (entry) => writeAudit({ ...entry, channel: opts.channel }),
  });
}
