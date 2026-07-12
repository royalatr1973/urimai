import { getPrisma } from "../src/index.js";
const sinceMin = Number(process.argv[2] ?? "10");
async function main() {
  const p = getPrisma();
  const rows = await p.auditLog.findMany({
    where: { createdAt: { gte: new Date(Date.now() - sinceMin * 60_000) } },
    orderBy: { createdAt: "asc" },
  });
  if (!rows.length) { console.log("no audit rows in window — inbound was likely a greeting (no extractable facts) or a status callback"); await p.$disconnect(); return; }
  const byTurn = new Map<string, any[]>();
  for (const r of rows) {
    const k = `${r.sessionId}|${r.createdAt.toISOString()}`;
    if (!byTurn.has(k)) byTurn.set(k, []);
    byTurn.get(k)!.push(r);
  }
  for (const [k, g] of byTurn) {
    const [session, time] = k.split("|");
    const inp = g[0].inputs as Record<string, unknown>;
    const nonNull = Object.fromEntries(Object.entries(inp).filter(([,v]) => v !== null));
    const v = g.map((r: any) => `${r.schemeId}:${r.status}`).join(" ");
    console.log(`${new Date(time!).toLocaleTimeString()} ${session}`);
    console.log(`   knows: ${JSON.stringify(nonNull)}`);
    console.log(`   verdicts: ${v}\n`);
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
