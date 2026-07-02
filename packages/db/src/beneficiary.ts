/**
 * Apply-stage beneficiary record — the ONE and ONLY place identity/PII is collected, and it
 * is stored encrypted at rest (PROJECT_BRIEF.md §2.3). The whole PII payload is encrypted
 * into a single ciphertext column; nothing identifying is stored in plaintext.
 */
import { getPrisma } from "./client.js";
import { encryptJson } from "./crypto.js";

export interface ApplyInput {
  sessionId: string;
  schemeId: string;
  pii: Record<string, unknown>; // name, aadhaar, phone, address, … — never logged, only encrypted
}

export async function createBeneficiaryRecord(input: ApplyInput): Promise<{ id: string }> {
  const ciphertext = encryptJson(input.pii); // throws if PII_ENCRYPTION_KEY missing — fail closed
  const rec = await getPrisma().beneficiaryRecord.create({
    data: { sessionId: input.sessionId, schemeId: input.schemeId, ciphertext },
  });
  return { id: rec.id };
}
