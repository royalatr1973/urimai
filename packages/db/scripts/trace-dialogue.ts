/**
 * Reconstruct a session's dialogue from the audit log.
 *
 * The audit log stores, per evaluation turn, a snapshot of the profile (what Urimai knew)
 * plus the six scheme verdicts. It does NOT store the user's verbatim text (Phase-7 Q5,
 * deliberately not built yet). So we reconstruct: what Urimai learned each turn, what it
 * therefore asked next, and the final verdicts.
 */
import { getPrisma } from "../src/index.js";

const sessionId = process.argv[2] ?? "wa:919003864468";

// Human labels for each profile field (for narrating what changed).
const LABEL: Record<string, string> = {
  age: "age", gender: "gender", marital_status: "marital status", state: "state / place",
  is_tamil_nadu: "lives in Tamil Nadu", disability_percent: "disability %",
  is_family_head: "head of family", income_tax_payer: "income-tax payer",
  govt_employee: "govt employee", owns_four_wheeler: "owns four-wheeler",
  monthly_income: "monthly income", fixed_assets_value: "fixed assets (₹)",
  has_regular_income: "has regular income", annual_family_income: "annual family income (₹)",
  land_acres_wet: "wet land (acres)", land_acres_dry: "dry land (acres)",
  annual_electricity_units: "electricity units/yr", professional_tax_payer: "professional-tax payer",
  is_pensioner: "pensioner", psu_or_bank_employee: "PSU/bank employee",
  elected_representative: "elected representative", is_bpl: "has BPL card",
};

const SCHEME_NAME: Record<string, string> = {
  kmut: "KMUT", oldage: "Old Age", widow: "Widow (DWPS)", disabled: "Disabled (DAPS)",
  ignwps: "IGNWPS (widow 40-59+BPL)", igndps: "IGNDPS (80%+BPL)",
};

async function main() {
  const p = getPrisma();
  const rows = await p.auditLog.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });

  if (rows.length === 0) {
    console.log(`No audit rows for ${sessionId}`);
    await p.$disconnect();
    return;
  }

  // Group rows into turns by timestamp (each turn writes one row per scheme).
  const turns: { t: Date; inputs: Record<string, unknown>; verdicts: { schemeId: string; status: string }[] }[] = [];
  const byTime = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.createdAt.toISOString();
    if (!byTime.has(key)) byTime.set(key, []);
    byTime.get(key)!.push(r);
  }
  for (const [key, group] of byTime) {
    turns.push({
      t: new Date(key),
      inputs: group[0]!.inputs as Record<string, unknown>,
      verdicts: group.map((g) => ({ schemeId: g.schemeId, status: g.status })),
    });
  }

  console.log(`\n=== Reconstructed dialogue for ${sessionId} (${turns.length} turns) ===\n`);

  let prev: Record<string, unknown> = {};
  turns.forEach((turn, i) => {
    const time = turn.t.toLocaleTimeString();
    // What changed since the previous turn = what the user just told us.
    const learned = Object.keys(turn.inputs).filter(
      (k) => turn.inputs[k] !== null && turn.inputs[k] !== prev[k],
    );
    const learnedStr = learned.length
      ? learned.map((k) => `${LABEL[k] ?? k} = ${JSON.stringify(turn.inputs[k])}`).join(", ")
      : "(nothing new extracted)";

    console.log(`--- Turn ${i + 1}  [${time}] ---`);
    console.log(`  👤 user turn → Urimai learned: ${learnedStr}`);

    const eligible = turn.verdicts.filter((v) => v.status === "eligible").map((v) => SCHEME_NAME[v.schemeId]);
    const needInfo = turn.verdicts.filter((v) => v.status === "need_info").map((v) => SCHEME_NAME[v.schemeId]);
    const notElig = turn.verdicts.filter((v) => v.status === "not_eligible").map((v) => SCHEME_NAME[v.schemeId]);

    if (needInfo.length === 0) {
      console.log(`  🤖 Urimai → RESULTS: eligible=[${eligible.join(", ") || "none"}]  not-eligible=[${notElig.join(", ")}]`);
    } else {
      console.log(`  🤖 Urimai → still gathering: eligible-so-far=[${eligible.join(", ") || "none"}]  need-info=[${needInfo.join(", ")}]  not-eligible=[${notElig.join(", ")}]`);
    }
    console.log("");
    prev = turn.inputs;
  });

  console.log("Note: the user's verbatim words are NOT stored (Phase-7 Q5, not built). The");
  console.log('"learned" line is inferred from what changed in the profile each turn.');
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
