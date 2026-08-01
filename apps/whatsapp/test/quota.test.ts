import { describe, it, expect } from "vitest";
import { createLetterQuota } from "../src/quota.js";

/** In-memory stand-in for the ioredis calls the quota uses, honouring SET ..NX semantics. */
function memoryStore() {
  const map = new Map<string, string>();
  const expires: Record<string, number> = {};
  return {
    map,
    expires,
    get: async (k: string) => map.get(k) ?? null,
    incr: async (k: string) => {
      const n = Number(map.get(k) ?? "0") + 1;
      map.set(k, String(n));
      return n;
    },
    expire: async (k: string, s: number) => void (expires[k] = s),
    set: async (k: string, v: string, _ex: "EX", _ttl: number, _nx: "NX") => {
      if (map.has(k)) return null; // NX: only the first write wins
      map.set(k, v);
      return "OK";
    },
  };
}

const noon = () => new Date("2026-08-01T12:00:00+05:30");

describe("letter quota — one letter per phone per day", () => {
  it("blocks only once the day's letter has been recorded", async () => {
    const q = createLetterQuota(memoryStore(), { limit: 1, now: noon });
    expect(await q.reached("911")).toBe(false);
    await q.record("911", "wa:911");
    expect(await q.reached("911")).toBe(true);
  });

  it("counts a letter once even if it re-delivers after corrections (same session)", async () => {
    const store = memoryStore();
    const q = createLetterQuota(store, { limit: 3, now: noon });
    await q.record("911", "wa:911");
    await q.record("911", "wa:911"); // correction re-delivery — must NOT count again
    await q.record("911", "wa:911");
    expect(store.map.get("madal:daily:911")).toBe("1");
  });

  it("keeps each phone's count separate", async () => {
    const q = createLetterQuota(memoryStore(), { limit: 1, now: noon });
    await q.record("911", "wa:911");
    expect(await q.reached("911")).toBe(true);
    expect(await q.reached("922")).toBe(false);
  });

  it("honours a higher limit before blocking", async () => {
    const q = createLetterQuota(memoryStore(), { limit: 2, now: noon });
    await q.record("911", "wa:s1");
    expect(await q.reached("911")).toBe(false); // 1 of 2
    await q.record("911", "wa:s2");
    expect(await q.reached("911")).toBe(true); // 2 of 2
  });

  it("limit 0 disables the cap entirely (never blocks, never counts)", async () => {
    const store = memoryStore();
    const q = createLetterQuota(store, { limit: 0, now: noon });
    await q.record("911", "wa:911");
    expect(await q.reached("911")).toBe(false);
    expect(store.map.size).toBe(0);
  });

  it("sets a positive TTL to the next local midnight on the first letter of the day", async () => {
    const store = memoryStore();
    const q = createLetterQuota(store, { limit: 1, now: noon });
    await q.record("911", "wa:911");
    // Mirror the impl's own math so the assertion is timezone-independent (setHours is local).
    const d = noon();
    const mid = new Date(d);
    mid.setHours(24, 0, 0, 0);
    const expected = Math.max(60, Math.ceil((mid.getTime() - d.getTime()) / 1000));
    expect(store.expires["madal:daily:911"]).toBe(expected);
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThanOrEqual(24 * 3600);
  });
});
