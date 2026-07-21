/**
 * Live end-to-end simulation of the Madal letters flow (Phase 3 manual verification).
 *
 *   pnpm letters:sim     # needs ANTHROPIC_API_KEY, Postgres (seeded letter types), Redis
 *
 * Drives the §7 script through the REAL pipeline — Claude classifier → extractor →
 * one-question gap loop → guarded drafter → read-back → one correction → approval —
 * printing each step. The genuine whole-brain test, not a mock.
 */
import { closeRedis } from "@urimai/cache";
import { getPrisma } from "@urimai/db";
import { createDefaultLettersOrchestrator } from "../src/index.js";

const turns = [
  // Narration: civic grievance with name, street, town; missing sender_address detail? gives it all.
  "எங்க தெருவுல சாக்கடை மூணு வாரமா ஓவர்ஃப்ளோ ஆகுது. பசங்க ஸ்கூல் போக முடியலை. முனிசிபாலிட்டிக்கு கடிதம் எழுதணும். என் பேரு லட்சுமி.",
  "ஆம்", // type confirmation
  "காமராஜர் தெரு, திண்டுக்கல்", // whatever the gap loop asks next (address expected)
  "எங்க தெருவுலதான்", // incident_place if asked
  "சரி, அதுல ஒரு திருத்தம் — மூணு வாரம் இல்ல, ஒரு மாசமா இப்படி இருக்குனு எழுதுங்க", // correction at read-back
  "சரி அனுப்புங்க", // approval
];

async function main() {
  const orch = createDefaultLettersOrchestrator();
  const session = `letters-sim-${Date.now()}`;

  const start = await orch.startSession(session);
  if (start.kind === "listen") console.log(`🤖  ${start.prompt.ta}`);

  for (const text of turns) {
    console.log(`\n👤  ${text}`);
    const r = await orch.handleTurn(session, text);
    switch (r.kind) {
      case "confirm_type":
        console.log(`🤖  [confirm ${r.typeId}] ${r.prompt.ta}`);
        break;
      case "question":
        console.log(`🤖  [ask ${r.fact}] ${r.question.ta}`);
        break;
      case "entity_question":
        console.log(`🤖  [ask entity ${r.entity}] ${r.question.ta}`);
        break;
      case "readback":
        console.log(`🤖  [readback rev ${r.revisions}, ${r.chunks.length} chunk(s)]`);
        for (const c of r.chunks) console.log("      ┃ " + c.replace(/\n/g, "\n      ┃ "));
        console.log(`🤖  ${r.prompt.ta}`);
        break;
      case "approved":
        console.log(`🤖  [approved after ${r.revisions} revision(s)] hash=${r.draftHash.slice(0, 16)}…`);
        console.log(`      utterance: "${r.approvalUtterance}"`);
        break;
      case "escalate":
        console.log(`🤖  [escalate after ${r.revisions} revisions]`);
        break;
      case "clarify":
        console.log(`🤖  [clarify] ${r.prompt.ta}`);
        break;
      case "listen":
        console.log(`🤖  ${r.prompt.ta}`);
        break;
    }
    if (r.kind === "approved") break;
  }

  // Show what was persisted (drafts + approval) for this session.
  const prisma = getPrisma();
  const drafts = await prisma.letterDraft.findMany({ where: { sessionId: session }, orderBy: { revision: "asc" } });
  const approvals = await prisma.letterApproval.findMany({ where: { sessionId: session } });
  console.log(`\n📋  persisted: ${drafts.length} draft revision(s), ${approvals.length} approval(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeRedis();
    await getPrisma().$disconnect();
  });
