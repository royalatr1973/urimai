/**
 * Merge the two official TN PIN code sources into one lookup table for Madal.
 *
 *   node scripts/build-pincode-dataset.mjs <village-taluk.csv> <post-office.csv>
 *     → writes data/tn_pincodes.csv  (one row per PIN code)
 *
 * Inputs
 *  A. Village/taluk file  — stateNameEnglish, districtNameEnglish, subdistrictNameEnglish
 *                           (= TALUK), villageNameEnglish, pincode
 *  B. Post office file    — officename, pincode, officetype (BO/PO/HO), district, latitude,
 *                           longitude
 *
 * Why one row per PIN code: the app looks up by PIN code, so the table is keyed by it.
 *
 * HONESTY ABOUT AMBIGUITY (measured on the real data, Aug 2026):
 *   ~44% of TN PIN codes span more than one TALUK, and ~11% span more than one DISTRICT —
 *   postal areas simply don't follow revenue boundaries. So we record the most common value
 *   AND a flag + count. The app must treat a flagged PIN as "district-level only" and NOT
 *   claim a taluk, because naming the wrong Tahsildar misroutes the citizen's letter.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../data/tn_pincodes.csv", import.meta.url));
const OUT_TS = fileURLToPath(new URL("../packages/types/src/pincode-data.ts", import.meta.url));

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function readRows(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const f = parseCsvLine(l);
    return Object.fromEntries(header.map((h, i) => [h, (f[i] ?? "").trim()]));
  });
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");
/** "THOOTHUKKUDI" / "the nilgiris" → "Thoothukkudi" / "The Nilgiris" */
const tidy = (s) =>
  String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\b([a-z])/g, (m) => m.toUpperCase());

/** Most frequent value in a counter map (ties → alphabetical, so runs are reproducible). */
function topOf(counter) {
  let best = null;
  let bestN = -1;
  for (const [v, n] of counter) {
    if (!v) continue;
    if (n > bestN || (n === bestN && v < best)) { best = v; bestN = n; }
  }
  return best;
}
function bump(map, key, value) {
  if (!value) return;
  const c = map.get(key) ?? new Map();
  c.set(value, (c.get(value) ?? 0) + 1);
  map.set(key, c);
}

// District → Tamil. Districts with no entry are reported, never guessed.
const DISTRICT_TAMIL = {
  chennai: "சென்னை", thiruvallur: "திருவள்ளூர்", tiruvallur: "திருவள்ளூர்",
  chengalpattu: "செங்கல்பட்டு", kancheepuram: "காஞ்சிபுரம்", kanchipuram: "காஞ்சிபுரம்",
  villupuram: "விழுப்புரம்", viluppuram: "விழுப்புரம்", kallakurichi: "கள்ளக்குறிச்சி",
  tiruvannamalai: "திருவண்ணாமலை", thiruvannamalai: "திருவண்ணாமலை", cuddalore: "கடலூர்",
  mayiladuthurai: "மயிலாடுதுறை", nagapattinam: "நாகப்பட்டினம்", nagappattinam: "நாகப்பட்டினம்",
  thiruvarur: "திருவாரூர்", tiruvarur: "திருவாரூர்", thanjavur: "தஞ்சாவூர்",
  pudukkottai: "புதுக்கோட்டை", pudukottai: "புதுக்கோட்டை",
  tiruchirappalli: "திருச்சிராப்பள்ளி", thiruchirappalli: "திருச்சிராப்பள்ளி", trichy: "திருச்சிராப்பள்ளி",
  perambalur: "பெரம்பலூர்", ariyalur: "அரியலூர்", ramanathapuram: "இராமநாதபுரம்",
  dindigul: "திண்டுக்கல்", madurai: "மதுரை", theni: "தேனி", virudhunagar: "விருதுநகர்",
  tirunelveli: "திருநெல்வேலி", thirunelveli: "திருநெல்வேலி", tenkasi: "தென்காசி",
  thoothukkudi: "தூத்துக்குடி", thoothukudi: "தூத்துக்குடி", tuticorin: "தூத்துக்குடி",
  kanniyakumari: "கன்னியாகுமரி", kanyakumari: "கன்னியாகுமரி",
  sivaganga: "சிவகங்கை", sivagangai: "சிவகங்கை", vellore: "வேலூர்",
  ranipet: "இராணிப்பேட்டை", ranipettai: "இராணிப்பேட்டை",
  tirupathur: "திருப்பத்தூர்", tirupattur: "திருப்பத்தூர்", thirupathur: "திருப்பத்தூர்",
  krishnagiri: "கிருஷ்ணகிரி", dharmapuri: "தர்மபுரி", salem: "சேலம்", namakkal: "நாமக்கல்",
  erode: "ஈரோடு", karur: "கரூர்", coimbatore: "கோயம்புத்தூர்",
  tiruppur: "திருப்பூர்", tirupur: "திருப்பூர்", thiruppur: "திருப்பூர்",
  nilgiris: "நீலகிரி", thenilgiris: "நீலகிரி",
  // Puducherry UT — geographically inside TN, so the postal files include it. Kept (a
  // citizen there may still use the service) but flagged: its government offices are NOT
  // the TN ones the grievance-category chain names.
  pondicherry: "புதுச்சேரி", puducherry: "புதுச்சேரி", karaikal: "காரைக்கால்",
};

/** Districts belonging to Puducherry UT rather than Tamil Nadu. */
const PUDUCHERRY = new Set(["pondicherry", "puducherry", "karaikal", "yanam", "mahe"]);

function main() {
  const [fileA, fileB] = process.argv.slice(2);
  if (!fileA || !fileB) {
    console.error("usage: node scripts/build-pincode-dataset.mjs <village-taluk.csv> <post-office.csv>");
    process.exit(1);
  }

  const districtOf = new Map(); // pin -> counter
  const talukOf = new Map();
  const officeOf = new Map(); // pin -> {name, rank}
  const coordOf = new Map();

  // --- A: village → taluk/district (the routing source) ---
  for (const r of readRows(fileA)) {
    const pin = (r.pincode ?? "").match(/\d{6}/)?.[0];
    if (!pin) continue;
    bump(districtOf, pin, tidy(r.districtNameEnglish));
    bump(talukOf, pin, tidy(r.subdistrictNameEnglish));
  }

  // --- B: post offices (names + coordinates); HO > PO > BO for the representative office ---
  const RANK = { HO: 3, PO: 2, SO: 2, BO: 1 };
  for (const r of readRows(fileB)) {
    const pin = (r.pincode ?? "").match(/\d{6}/)?.[0];
    if (!pin) continue;
    bump(districtOf, pin, tidy(r.district));
    const rank = RANK[String(r.officetype ?? "").toUpperCase()] ?? 0;
    const prev = officeOf.get(pin);
    if (!prev || rank > prev.rank) officeOf.set(pin, { name: tidy(r.officename), rank });
    const lat = Number(r.latitude);
    const lon = Number(r.longitude);
    if (!coordOf.has(pin) && Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0) {
      coordOf.set(pin, { lat: lat.toFixed(4), lon: lon.toFixed(4) });
    }
  }

  const pins = [...new Set([...districtOf.keys(), ...officeOf.keys()])].sort();
  const unknownDistricts = new Set();
  let ambiguousTaluk = 0;
  let ambiguousDistrict = 0;

  let droppedNa = 0;
  const rows = pins.flatMap((pin) => {
    const dCounter = districtOf.get(pin) ?? new Map();
    const tCounter = talukOf.get(pin) ?? new Map();
    const district = topOf(dCounter) ?? "";
    // "NA" districts are NDC bulk-mail centres, not places citizens live — not addressable.
    if (norm(district) === "na") { droppedNa++; return []; }
    const taluk = topOf(tCounter) ?? "";
    const dCount = [...dCounter.keys()].filter(Boolean).length;
    const tCount = [...tCounter.keys()].filter(Boolean).length;
    if (dCount > 1) ambiguousDistrict++;
    if (tCount > 1) ambiguousTaluk++;
    const ta = DISTRICT_TAMIL[norm(district)] ?? "";
    if (district && !ta) unknownDistricts.add(district);
    const c = coordOf.get(pin);
    return [[
      pin,
      PUDUCHERRY.has(norm(district)) ? "PY" : "TN",
      district,
      ta,
      taluk,
      String(tCount),
      dCount > 1 ? "yes" : "no",
      officeOf.get(pin)?.name ?? "",
      c?.lat ?? "",
      c?.lon ?? "",
    ]];
  });

  const esc = (v) => (/[",]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v);
  const header = "pincode,state,district,district_tamil,taluk,taluk_count,district_ambiguous,post_office,lat,lon";
  // UTF-8 BOM: without it Excel opens the file as ANSI and silently destroys every Tamil
  // character (turning them into "?") the moment it is re-saved.
  try {
    writeFileSync(OUT, "﻿" + [header, ...rows.map((r) => r.map(esc).join(","))].join("\r\n") + "\r\n", "utf8");
  } catch (e) {
    if (e.code === "EBUSY") console.log(`  ⚠ ${OUT} is open in another program — CSV not rewritten (continuing)`);
    else throw e;
  }

  console.log(`wrote ${OUT}`);
  console.log(`  ${rows.length} PIN codes  (TN ${rows.filter((r) => r[1] === "TN").length}, Puducherry ${rows.filter((r) => r[1] === "PY").length})`);
  console.log(`  taluk unambiguous (taluk_count=1): ${rows.filter((r) => r[5] === "1").length}`);
  console.log(`  taluk AMBIGUOUS (spans >1 taluk) : ${ambiguousTaluk}  ← app must use district only`);
  console.log(`  district ambiguous               : ${ambiguousDistrict}`);
  console.log(`  with a post office name          : ${rows.filter((r) => r[7]).length}`);
  console.log(`  with coordinates                 : ${rows.filter((r) => r[8]).length}`);
  console.log(`  dropped NDC/bulk-mail rows (NA)  : ${droppedNa}`);

  // --- generated lookup module (the app reads this, not the CSV) --------------
  // Encoded compactly: shared district/taluk tables + one "pin,dIdx,tIdx" row each, so the
  // 2k-entry table costs ~40KB instead of ~400KB of object literals.
  // Curator-supplied Tamil taluk names (data/tn_taluk_tamil.csv) — so the address line is
  // fully Tamil instead of mixed script. Falls back to the English name when absent.
  const talukTamil = new Map();
  try {
    const t = readFileSync(fileURLToPath(new URL("../data/tn_taluk_tamil.csv", import.meta.url)), "utf8")
      .replace(/^﻿/, "");
    for (const line of t.split(/\r?\n/).slice(1)) {
      if (!line.trim()) continue;
      const f = parseCsvLine(line);
      if (f[0] && f[1]) talukTamil.set(f[0].trim(), f[1].trim());
    }
    console.log(`  taluk Tamil names loaded          : ${talukTamil.size}`);
  } catch {
    console.log("  (no data/tn_taluk_tamil.csv — taluks will stay English)");
  }

  const districts = [...new Set(rows.map((r) => `${r[3] || r[2]}|${r[1]}`))].sort();
  const talukName = (en) => talukTamil.get(en) ?? en;
  const taluks = [...new Set(rows.map((r) => talukName(r[4])).filter(Boolean))].sort();
  const dIdx = new Map(districts.map((d, i) => [d, i]));
  const tIdx = new Map(taluks.map((t, i) => [t, i]));
  // A taluk is only emitted when the PIN maps to exactly ONE — an ambiguous PIN must never
  // claim a taluk, because naming the wrong Tahsildar misroutes the letter.
  const packed = rows
    .map((r) => `${r[0]},${dIdx.get(`${r[3] || r[2]}|${r[1]}`)},${r[5] === "1" ? tIdx.get(talukName(r[4])) : ""}`)
    .join(";");

  const ts = `/**
 * GENERATED — do not edit. Rebuild with:
 *   node scripts/build-pincode-dataset.mjs <village-taluk.csv> <post-office.csv>
 *
 * Source of truth: data/tn_pincodes.csv (reviewable). ${rows.length} PIN codes.
 * A taluk is present ONLY where the PIN code maps to exactly one taluk
 * (${rows.filter((r) => r[5] === "1").length} of ${rows.length}); the rest are district-level only,
 * because ~40% of TN PIN codes straddle taluk boundaries.
 */
const DISTRICTS = ${JSON.stringify(districts)};
const TALUKS = ${JSON.stringify(taluks)};
const PACKED = ${JSON.stringify(packed)};

export interface PincodePlace {
  /** Tamil district name (falls back to the English name when no Tamil is known). */
  district: string;
  /** "TN" | "PY" — Puducherry PIN codes are inside TN but have their own government. */
  state: string;
  /** Taluk, only when unambiguous for this PIN code; null otherwise. */
  taluk: string | null;
}

let index: Map<string, PincodePlace> | null = null;
function build(): Map<string, PincodePlace> {
  const m = new Map<string, PincodePlace>();
  for (const row of PACKED.split(";")) {
    const [pin, d, t] = row.split(",");
    if (!pin) continue;
    const [district, state] = (DISTRICTS[Number(d)] ?? "|TN").split("|");
    m.set(pin, { district: district ?? "", state: state ?? "TN", taluk: t === "" ? null : (TALUKS[Number(t)] ?? null) });
  }
  return m;
}

/** Exact PIN code → place, from the official directory. null when the PIN is unknown. */
export function lookupPincode(pin: string): PincodePlace | null {
  index ??= build();
  return index.get(pin) ?? null;
}
`;
  writeFileSync(OUT_TS, ts, "utf8");
  console.log(`wrote ${OUT_TS} (${(ts.length / 1024).toFixed(0)} KB)`);
  if (unknownDistricts.size > 0) {
    console.log(`  ⚠ no Tamil name (add to DISTRICT_TAMIL): ${[...unknownDistricts].join(", ")}`);
  }
}

main();
