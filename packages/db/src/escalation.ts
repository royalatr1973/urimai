/**
 * DB-backed escalation queue + operator-view reads. The "help → human" tickets from the
 * WhatsApp channel land here (the EscalationQueue interface is satisfied by `enqueue`). The
 * contact number and message are PII, so they are encrypted at rest and decrypted only when
 * an operator reads the queue.
 */
import { getPrisma } from "./client.js";
import { encryptString, decryptString } from "./crypto.js";

export interface EscalationInput {
  from: string; // contact (phone) — PII
  text: string; // the user's message — may contain PII
  reason: string;
  at: string;
}

/** Implements the channel's EscalationQueue contract, persisting to Postgres (encrypted). */
export class DbEscalationQueue {
  async enqueue(t: EscalationInput): Promise<void> {
    await getPrisma().escalation.create({
      data: { fromEnc: encryptString(t.from), textEnc: encryptString(t.text), reason: t.reason, status: "pending" },
    });
  }
}

/** Operator view: pending tickets with contact + message decrypted for the human. */
export async function listPendingEscalations() {
  const rows = await getPrisma().escalation.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    from: decryptString(r.fromEnc),
    text: decryptString(r.textEnc),
    reason: r.reason,
    createdAt: r.createdAt,
  }));
}

export async function resolveEscalation(id: string): Promise<void> {
  await getPrisma().escalation.update({ where: { id }, data: { status: "resolved", resolvedAt: new Date() } });
}
