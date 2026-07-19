/**
 * Minimal escalation handoff: when a user asks for help, drop a ticket onto a queue for a
 * human. The full escalation queue + operator view is Phase 6 — this is just the channel
 * side of the "help → human" promise, intentionally backend-agnostic via the interface.
 */
import type { Redis } from "@urimai/cache";

export interface EscalationTicket {
  from: string;
  text: string;
  reason: "help_requested";
  at: string; // ISO timestamp, stamped by the caller
}

export interface EscalationQueue {
  enqueue(ticket: EscalationTicket): Promise<void>;
}

const KEY = "urimai:escalations";

/** Pushes tickets onto a Redis list; Phase 6's operator view will consume them. */
export class RedisEscalationQueue implements EscalationQueue {
  constructor(private redis: Redis) {}
  async enqueue(ticket: EscalationTicket): Promise<void> {
    await this.redis.lpush(KEY, JSON.stringify(ticket));
  }
}
