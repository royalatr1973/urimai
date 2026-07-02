/**
 * Redis wiring for Urimai.
 *
 * The session manager (Phase 3) stores per-conversation Profile state here so the
 * channel-agnostic orchestrator can resume a conversation across turns. Phase 0 only
 * wires up a configured, reusable client — no session logic yet.
 */
import { Redis, type RedisOptions } from "ioredis";

let client: Redis | null = null;

/** Lazily create (and memoize) a shared Redis client from REDIS_URL. */
export function getRedis(options?: RedisOptions): Redis {
  if (client) return client;

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "REDIS_URL is not set. Copy .env.example to .env and configure it.",
    );
  }

  client = new Redis(url, {
    // Fail fast in dev rather than hanging if Redis is down.
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    ...options,
  });

  return client;
}

/** Close the shared client (use on graceful shutdown / in tests). */
export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}

/** Ping Redis; returns true if it answers PONG. Handy for health checks. */
export async function pingRedis(): Promise<boolean> {
  const res = await getRedis().ping();
  return res === "PONG";
}

export { Redis };
