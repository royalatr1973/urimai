/**
 * Emit the taluk names that need Tamil, for curator translation.
 *   node scripts/build-taluk-translation-list.mjs
 *     → data/tn_taluks_to_translate.csv
 *
 * Sorted by how many PIN codes use each taluk, so translating the top rows covers the most
 * letters. `taluk_tamil` is pre-filled ONLY where the taluk name is identical to a district
 * whose Tamil name is already verified; everything else is blank for the curator.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../data/tn_pincodes.csv", import.meta.url));
const OUT = fileURLToPath(new URL("../data/tn_taluks_to_translate.csv", import.meta.url));

const rows = readFileSync(SRC, "utf8").split(/\r?\n/).filter((l) => l.trim()).slice(1)
  .map((l) => l.split(","));

// taluk -> {districts:Set, pins:count}; column order: pincode,state,district,district_tamil,taluk,...
const byTaluk = new Map();
for (const r of rows) {
  const taluk = (r[4] ?? "").trim();
  if (!taluk) continue;
  const e = byTaluk.get(taluk) ?? { districts: new Map(), pins: 0 };
  e.pins += 1;
  e.districts.set(r[2], (e.districts.get(r[2]) ?? 0) + 1);
  byTaluk.set(taluk, e);
}

// Verified district Tamil names, keyed by English district — safe to reuse when a taluk
// carries the same name as its district (very common: Madurai taluk in Madurai district).
const districtTamil = new Map();
for (const r of rows) if (r[2] && r[3]) districtTamil.set(r[2].toLowerCase(), r[3]);

const out = [...byTaluk.entries()]
  .sort((a, b) => b[1].pins - a[1].pins || a[0].localeCompare(b[0]))
  .map(([taluk, e]) => {
    const districts = [...e.districts.entries()].sort((x, y) => y[1] - x[1]).map(([d]) => d);
    const pre = districtTamil.get(taluk.toLowerCase()) ?? "";
    return [taluk, districts.join(" / "), String(e.pins), pre, pre ? "prefilled-same-as-district" : ""];
  });

const esc = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
writeFileSync(OUT, ["taluk,district,pincode_count,taluk_tamil,note", ...out.map((r) => r.map(esc).join(","))].join("\n") + "\n", "utf8");
console.log(`wrote ${OUT}`);
console.log(`  ${out.length} taluks; ${out.filter((r) => r[3]).length} pre-filled, ${out.filter((r) => !r[3]).length} to translate`);
const top = out.slice(0, 50).reduce((s, r) => s + Number(r[2]), 0);
console.log(`  top 50 taluks cover ${top} of ${rows.filter((r) => r[4]).length} taluk-mapped PIN codes (${(top / rows.filter((r) => r[4]).length * 100).toFixed(0)}%)`);
