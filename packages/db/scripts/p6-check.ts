import { getPrisma, decryptJson, DbEscalationQueue, listPendingEscalations, resolveEscalation } from "../src/index.js";

async function main() {
  const prisma = getPrisma();

  console.log("\n=== 1) AUDIT LOG — every evaluation, with rule version ===");
  const audit = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 4 });
  for (const a of audit) console.log(`   [${a.channel}] ${a.schemeId.padEnd(9)} v${a.ruleVersion}  ${a.status}`);
  const inputsKeys = audit[0] ? Object.keys(audit[0].inputs as Record<string, unknown>) : [];
  const piiInDiscovery = ["name", "aadhaar", "phone", "address"].some((k) => inputsKeys.includes(k));
  console.log(`   audit inputs key count: ${inputsKeys.length} | identity fields present? ${piiInDiscovery}`);
  console.log(`   total audit rows: ${await prisma.auditLog.count()}`);

  console.log("\n=== 2) BENEFICIARY RECORD — PII encrypted at rest ===");
  const ben = await prisma.beneficiaryRecord.findFirst({ orderBy: { createdAt: "desc" } });
  if (ben) {
    console.log(`   ciphertext: ${ben.ciphertext.slice(0, 56)}…`);
    console.log(`   "Lakshmi" present in ciphertext? ${ben.ciphertext.includes("Lakshmi")}`);
    console.log(`   "9199999999" present in ciphertext? ${ben.ciphertext.includes("9199999999")}`);
    console.log(`   decrypts back to: ${JSON.stringify(decryptJson(ben.ciphertext))}`);
  } else console.log("   (no beneficiary record)");

  console.log("\n=== 3) ESCALATION OPERATOR VIEW — help → human (encrypted) ===");
  await new DbEscalationQueue().enqueue({ from: "9198765", text: "எனக்கு உதவி வேண்டும்", reason: "help_requested", at: new Date().toISOString() });
  const raw = await prisma.escalation.findFirst({ where: { status: "pending" }, orderBy: { createdAt: "desc" } });
  console.log(`   stored fromEnc (encrypted): ${raw?.fromEnc.slice(0, 36)}…`);
  let pending = await listPendingEscalations();
  console.log(`   operator sees decrypted: ${pending.map((p) => `from=${p.from} "${p.text}"`).join(" | ")}`);
  if (pending[0]) {
    await resolveEscalation(pending[0].id);
    console.log(`   resolved ${pending[0].id.slice(0, 8)}`);
  }
  console.log(`   pending after resolve: ${(await listPendingEscalations()).length}`);

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
