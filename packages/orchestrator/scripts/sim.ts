/**
 * Live end-to-end simulation of the orchestrator (Phase 3 manual verification).
 *
 *   pnpm sim          # needs ANTHROPIC_API_KEY, Postgres (seeded), and Redis up
 *
 * Drives a scripted multi-turn Tamil conversation through the REAL pipeline — Claude
 * extractor → channel-agnostic orchestrator → deterministic engine over the seeded rules —
 * and prints, each turn, either the next gap question or the final verdicts. This is the
 * genuine whole-brain test, not a mock.
 */
import { closeRedis } from "@urimai/cache";
import { getPrisma } from "@urimai/db";
import { createDefaultOrchestrator } from "../src/index.js";

const utterances = [
  "எனக்கு வயசு 67, விதவை, மதுரையில் வசிக்கிறேன்.",
  "எனக்கு நிலையான வருமானம் எதுவும் இல்லை, ஆதரவற்றவள்.",
  "சொத்து ஒன்றும் இல்லை, கிட்டத்தட்ட பத்தாயிரம் ரூபாய் மதிப்புதான் இருக்கு.",
  "எனக்கு மாற்றுத்திறன் இல்லை.",
  "ஆமா, நான்தான் என் குடும்பத் தலைவி.",
  "எங்க குடும்ப வருமானம் வருடத்துக்கு சுமார் 80000 ரூபாய். நிலம் இல்ல, கார் இல்ல, அரசு வேலை இல்ல, எந்த வரியும் கட்டல, ஓய்வூதியம் இல்ல, வங்கி/பொதுத்துறை வேலை இல்ல, தேர்தல் பிரதிநிதி இல்ல, வீட்டு மின்சாரம் சாதாரணம்.",
];

async function main() {
  const orch = createDefaultOrchestrator();
  const session = `sim-${Date.now()}`;

  for (const text of utterances) {
    console.log(`\n👤  ${text}`);
    const r = await orch.handleTurn(session, text);
    if (r.kind === "question") {
      console.log(`🤖  [ask ${r.field}] ${r.question.ta}`);
      console.log(`              (${r.question.en})`);
    } else {
      console.log("🤖  Results:");
      for (const v of r.verdicts) {
        const reasons = v.reasons.length ? ` — ${v.reasons.slice(0, 2).join("; ")}${v.reasons.length > 2 ? " …" : ""}` : "";
        console.log(`      • ${v.schemeId.padEnd(9)} ${v.status}${reasons}`);
      }
    }
  }
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
