/**
 * Per-phone daily letter cap — the first line of abuse/budget protection for a public
 * launch. One delivered letter per mobile number per day (DAILY_LETTER_LIMIT), resetting
 * at local midnight.
 *
 * Design choices that matter for a helping service:
 *  - Counted on successful DELIVERY, not on start — so a citizen who abandons or fails
 *    mid-letter is never locked out; only actually receiving a letter uses the quota.
 *  - Checked only when STARTING a new letter — an in-progress letter (including its
 *    post-delivery review and corrections) is never blocked halfway.
 *  - Deduped per session, so correcting a letter (which re-delivers) still counts as one.
 *  - DAILY_LETTER_LIMIT=0 (or blank) disables the cap entirely.
 */
interface QuotaStore {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  set(key: string, value: string, exFlag: "EX", ttl: number, nxFlag: "NX"): Promise<unknown>;
}

export interface LetterQuota {
  limit: number;
  reached(phone: string): Promise<boolean>;
  record(phone: string, sessionId: string): Promise<void>;
}

/**
 * @param opts.limit    Global default cap (DAILY_LETTER_LIMIT). 0/blank = disabled.
 * @param opts.limitFor Optional per-phone override resolver (the admin allowlist). Returns a
 *                      number to override the default for that phone, or null to fall back.
 *                      Failures here must never block a citizen — treat them as "no override".
 */
export function createLetterQuota(
  store: QuotaStore,
  opts: { limit?: number; now?: () => Date; limitFor?: (phone: string) => Promise<number | null> } = {},
): LetterQuota {
  const defaultLimit = opts.limit ?? Number(process.env.DAILY_LETTER_LIMIT ?? "1");
  const now = opts.now ?? (() => new Date());
  const key = (phone: string) => `madal:daily:${phone}`;

  /** This phone's effective cap: its allowlist override if any, else the global default. */
  async function limitFor(phone: string): Promise<number> {
    if (opts.limitFor) {
      try {
        const o = await opts.limitFor(phone);
        if (o !== null && o !== undefined && Number.isFinite(o)) return o;
      } catch {
        /* override lookup failed — fall back to the default rather than lock anyone out */
      }
    }
    return defaultLimit;
  }

  function secondsToMidnight(): number {
    const d = now();
    const mid = new Date(d);
    mid.setHours(24, 0, 0, 0); // next local midnight
    return Math.max(60, Math.ceil((mid.getTime() - d.getTime()) / 1000));
  }

  return {
    limit: defaultLimit,
    async reached(phone: string): Promise<boolean> {
      const limit = await limitFor(phone);
      if (!Number.isFinite(limit) || limit <= 0) return false; // disabled / unlimited
      const v = await store.get(key(phone));
      return (v ? Number(v) : 0) >= limit;
    },
    async record(phone: string, sessionId: string): Promise<void> {
      const limit = await limitFor(phone);
      if (!Number.isFinite(limit) || limit <= 0) return;
      // Count each letter once, even if it re-delivers after a correction (same session).
      const first = await store.set(`madal:counted:${sessionId}`, "1", "EX", 40 * 60, "NX");
      if (first === null) return;
      const k = key(phone);
      const n = await store.incr(k);
      if (n === 1) await store.expire(k, secondsToMidnight());
    },
  };
}
