import { getPrisma } from "../src/index.js";

const p = getPrisma();
const sessionId = "wa:919500050289";
const rows = await p.auditLog.findMany({
  where: { sessionId, schemeId: "widow" },
  orderBy: { createdAt: "asc" },
});

console.log(`\n${rows.length} widow-scheme audit rows for ${sessionId}\n`);
console.log("time     | marital_status     | age | gender");
console.log("---------+--------------------+-----+--------");
for (const r of rows) {
  const i = r.inputs as Record<string, unknown>;
  const t = new Date(r.createdAt).toISOString().slice(11, 19);
  console.log(
    `${t} | ${String(i.marital_status).padEnd(18)} | ${String(i.age).padEnd(3)} | ${i.gender}`
  );
}
await p.$disconnect();
