import { getPrisma } from "../src/index.js";
const sessionId = process.argv[2] ?? "wa:919003864468";
const baseline = Number(process.argv[3] ?? "14"); // turns seen so far
const NAME: Record<string,string> = { kmut:"KMUT", oldage:"OldAge", widow:"Widow", disabled:"Disabled", ignwps:"IGNWPS", igndps:"IGNDPS" };

function sleep(ms:number){ return new Promise(r=>setTimeout(r,ms)); }

async function turnCount(p:any){
  const rows = await p.auditLog.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
  const times = new Set(rows.map((r:any)=>r.createdAt.toISOString()));
  return { count: times.size, rows };
}

async function main() {
  const p = getPrisma();
  const deadline = Date.now() + 9*60*1000; // 9 min max
  while (Date.now() < deadline) {
    const { count, rows } = await turnCount(p);
    if (count > baseline) {
      // Show all NEW turns beyond baseline
      const byTime = new Map<string, any[]>();
      for (const r of rows) {
        const k = r.createdAt.toISOString();
        if (!byTime.has(k)) byTime.set(k, []);
        byTime.get(k)!.push(r);
      }
      const entries = [...byTime.entries()];
      console.log(`NEW ACTIVITY — session grew from ${baseline} to ${count} turns\n`);
      entries.slice(baseline).forEach(([k,g],idx)=>{
        const inp = g[0].inputs as Record<string,unknown>;
        const nonNull = Object.fromEntries(Object.entries(inp).filter(([,v])=>v!==null));
        const v = g.map((r:any)=>`${NAME[r.schemeId]??r.schemeId}:${r.status}`).join("  ");
        console.log(`Turn ${baseline+idx+1} [${new Date(k).toLocaleTimeString()}]  (${g.length} schemes = ${g.length===6?"NEW v2 rules":"old v1"})`);
        console.log(`   profile: ${JSON.stringify(nonNull)}`);
        console.log(`   verdicts: ${v}\n`);
      });
      await p.$disconnect();
      return;
    }
    await sleep(15000);
  }
  console.log(`No new turns in 9 min (still ${baseline}). He's idle.`);
  await p.$disconnect();
}
main().catch((e)=>{console.error(e);process.exit(1);});
