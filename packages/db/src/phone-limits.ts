/**
 * Per-phone daily letter-limit overrides (operator allowlist). The WhatsApp quota consults
 * these before falling back to the global DAILY_LETTER_LIMIT, so the operator can give their
 * own device and a handful of testers a higher cap (e.g. 5/day) during a pilot.
 *
 * Phones are normalized to the same shape WhatsApp delivers in `from` — digits only, with a
 * 10-digit local number promoted to +91 — so an operator can type "9791234567" and it still
 * matches the "919791234567" the webhook sees.
 */
import { getPrisma } from "./client.js";

export interface PhoneLimitRow {
  phone: string;
  dailyLimit: number;
  label: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Digits-only; a bare 10-digit Indian mobile is promoted to its 91-prefixed wa_id form. */
export function normalizePhone(input: string): string {
  const digits = String(input ?? "").replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
}

export async function listPhoneLimits(): Promise<PhoneLimitRow[]> {
  return getPrisma().phoneLimit.findMany({ orderBy: { updatedAt: "desc" } });
}

/** The override for one phone, or null when it isn't on the list (→ use the global default). */
export async function getPhoneLimit(phone: string): Promise<PhoneLimitRow | null> {
  const p = normalizePhone(phone);
  if (!p) return null;
  return getPrisma().phoneLimit.findUnique({ where: { phone: p } });
}

/** Add or update an override. Throws on a phone that doesn't normalize to a plausible number. */
export async function setPhoneLimit(input: { phone: string; dailyLimit: number; label?: string | null }): Promise<PhoneLimitRow> {
  const phone = normalizePhone(input.phone);
  if (phone.length < 10 || phone.length > 15) throw new Error("phone must be a valid mobile number");
  const dailyLimit = Math.trunc(input.dailyLimit);
  if (!Number.isFinite(dailyLimit) || dailyLimit < 0 || dailyLimit > 1000) throw new Error("dailyLimit must be between 0 and 1000");
  const label = input.label?.trim() ? input.label.trim().slice(0, 80) : null;
  return getPrisma().phoneLimit.upsert({
    where: { phone },
    create: { phone, dailyLimit, label },
    update: { dailyLimit, label },
  });
}

export async function deletePhoneLimit(phone: string): Promise<void> {
  const p = normalizePhone(phone);
  if (!p) return;
  await getPrisma().phoneLimit.deleteMany({ where: { phone: p } }); // deleteMany: no-throw if absent
}
