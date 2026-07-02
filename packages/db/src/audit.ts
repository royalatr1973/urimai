/**
 * Immutable audit log. EVERY eligibility evaluation writes one record per scheme, capturing
 * inputs (the no-PII profile), the rule version, the verdict, and reasons. Append-only:
 * there is no update/delete path here (PROJECT_BRIEF.md §2.6, Phase 6).
 */
import type { Profile, Verdict } from "@urimai/types";
import { getPrisma } from "./client.js";

export interface AuditEntry {
  sessionId: string;
  channel?: string; // web | whatsapp | ...
  profile: Profile; // NO identity/PII — discovery facts only
  verdicts: Verdict[];
}

/** Write one immutable row per verdict. */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  if (entry.verdicts.length === 0) return;
  await getPrisma().auditLog.createMany({
    data: entry.verdicts.map((v) => ({
      sessionId: entry.sessionId,
      channel: entry.channel ?? null,
      schemeId: v.schemeId,
      ruleVersion: v.ruleVersion,
      status: v.status,
      reasons: v.reasons as unknown as object,
      inputs: entry.profile as unknown as object,
    })),
  });
}

/** Read recent audit rows (for the operator view / verification). */
export async function listAudit(sessionId?: string, take = 100) {
  return getPrisma().auditLog.findMany({
    where: sessionId ? { sessionId } : {},
    orderBy: { createdAt: "desc" },
    take,
  });
}
