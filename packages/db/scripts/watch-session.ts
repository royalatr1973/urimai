import { getPrisma } from "../src/index.js";
const sessionId = process.argv[2] ?? "wa:919003864468";
const NAME: Record<string,string> = { kmut:"KMUT", oldage:"OldAge", widow:"Widow", disabled:"Disabled", ignwps:"IGNWPS", igndps:"IGNDPS" };
async function main() {
  const p = getPrisma();
  const rows = await p.auditLog.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
  const byTime = new Map<string, any[]>();
  for (const r of rows) {
    const k = r.createdAt.toISOString();
    if (!byTime.has(k)) byTime.set(k, []);
    byTime.get(k)!.push(r);
  }
  // Only show turns evaluated under the NEW rules: 6 schemes present.
  let shown = 0, i = 0;
  for (const [k, g] of byTime) {
    i++;
    if (g.length < 6) continue; // old 4-scheme era, skip
    shown++;
    const inp = g[0].inputs as Record<string, unknown>;
    const nonNull = Object.fromEntries(Object.entries(inp).filter(([,v]) => v !== null));
    const v = g.map((r:any)=>`${NAME[r.schemeId]??r.schemeId}:${r.status}`).join("  ");
    console.log(`Turn ${i} [${new Date(k).toLocaleTimeString()}]`);
    console.log(`   profile: ${JSON.stringify(nonNull)}`);
    console.log(`   verdicts: ${v}`);
    console.log(`   is_bpl asked/known: ${"is_bpl" in nonNull ? nonNull["is_bpl"] : "not yet"}`);
    console.log("");
  }
  if (shown === 0) console.log(`No post-reseed (6-scheme) turns yet for ${sessionId}. Last turn count still 4-scheme. Total turns: ${byTime.size}`);
  await p.$disconnect();
}
main().catch((e)=>{console.error(e);process.exit(1);});
