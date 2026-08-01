/**
 * Convert the official India Post "All India Pincode Directory" into the Madal seed file.
 *
 *   node scripts/import-pincodes.mjs <official.json|official.csv> [--state "TAMIL NADU"]
 *     → writes data/tn_pincodes.csv
 *
 * Accepts the data.gov.in JSON export (either a bare array, or the API envelope with a
 * `records`/`data` array) as well as CSV. JSON is the safer download: no delimiter or
 * encoding ambiguity, and Tamil text survives intact.
 *
 * WHY an importer rather than a hand-written dataset: there are ~19,000 PIN codes in Tamil
 * Nadu, each with an office name and taluk. That data must come from the authoritative
 * source — inventing office names or taluk mappings would misroute real citizens' letters.
 *
 * Source (free, official, no key):
 *   https://www.data.gov.in  →  search "All India Pincode Directory"
 *   (also mirrored on the India Post site; any CSV with the columns below works)
 *
 * The official file's headers vary slightly between releases, so we match case/space
 * insensitively and accept the common aliases.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../data/tn_pincodes.csv", import.meta.url));

/** Minimal RFC-4180 line parser (quoted fields, "" escapes). */
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { q = false; }
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");

/** Pick a value from a record by any of its known field aliases (case/space-insensitive). */
function pick(rec, ...aliases) {
  const want = aliases.map(norm);
  for (const [k, v] of Object.entries(rec)) if (want.includes(norm(k))) return v;
  return undefined;
}

/**
 * Load the official file as an array of plain records, from JSON or CSV.
 * JSON may be a bare array, or the data.gov.in envelope: {records:[…]} / {data:[…]}.
 */
function loadRecords(src) {
  const raw = readFileSync(src, "utf8");
  const looksJson = /\.json$/i.test(src) || /^\s*[[{]/.test(raw);
  if (looksJson) {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.records)
        ? parsed.records
        : Array.isArray(parsed.data)
          ? parsed.data
          : Array.isArray(parsed.rows)
            ? parsed.rows
            : null;
    if (!arr) throw new Error("JSON has no array of records (expected [] or {records|data|rows: []})");
    // data.gov.in sometimes ships `data` as arrays-of-values plus a `field` list — zip them.
    if (arr.length > 0 && Array.isArray(arr[0]) && Array.isArray(parsed.field)) {
      const names = parsed.field.map((f) => f.id ?? f.name ?? f);
      return arr.map((row) => Object.fromEntries(names.map((n, i) => [n, row[i]])));
    }
    return arr;
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const f = parseCsvLine(line);
    return Object.fromEntries(header.map((h, i) => [h, f[i]]));
  });
}

/** Title-case a SHOUTED official name ("KOVILPATTI S.O" → "Kovilpatti S.O"). */
const tidy = (s) =>
  String(s ?? "").trim().toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\s+/g, " ");

// District → Tamil name. Extend as districts split; unknown districts pass through blank
// (the app falls back to the prefix map), never a guess.
const DISTRICT_TAMIL = {
  chennai: "சென்னை", tiruvallur: "திருவள்ளூர்", thiruvallur: "திருவள்ளூர்",
  chengalpattu: "செங்கல்பட்டு", kancheepuram: "காஞ்சிபுரம்", kanchipuram: "காஞ்சிபுரம்",
  villupuram: "விழுப்புரம்", viluppuram: "விழுப்புரம்", tiruvannamalai: "திருவண்ணாமலை",
  cuddalore: "கடலூர்", mayiladuthurai: "மயிலாடுதுறை", nagapattinam: "நாகப்பட்டினம்",
  tiruvarur: "திருவாரூர்", thiruvarur: "திருவாரூர்", thanjavur: "தஞ்சாவூர்",
  pudukkottai: "புதுக்கோட்டை", tiruchirappalli: "திருச்சிராப்பள்ளி", trichy: "திருச்சிராப்பள்ளி",
  perambalur: "பெரம்பலூர்", ariyalur: "அரியலூர்", ramanathapuram: "இராமநாதபுரம்",
  dindigul: "திண்டுக்கல்", madurai: "மதுரை", theni: "தேனி", virudhunagar: "விருதுநகர்",
  tirunelveli: "திருநெல்வேலி", tenkasi: "தென்காசி", thoothukudi: "தூத்துக்குடி",
  thoothukkudi: "தூத்துக்குடி", tuticorin: "தூத்துக்குடி",
  kanniyakumari: "கன்னியாகுமரி", kanyakumari: "கன்னியாகுமரி",
  sivaganga: "சிவகங்கை", sivagangai: "சிவகங்கை", vellore: "வேலூர்", ranipet: "இராணிப்பேட்டை",
  tirupathur: "திருப்பத்தூர்", tirupattur: "திருப்பத்தூர்", krishnagiri: "கிருஷ்ணகிரி",
  dharmapuri: "தர்மபுரி", salem: "சேலம்", namakkal: "நாமக்கல்", erode: "ஈரோடு",
  karur: "கரூர்", coimbatore: "கோயம்புத்தூர்", tiruppur: "திருப்பூர்", tirupur: "திருப்பூர்",
  nilgiris: "நீலகிரி", thenilgiris: "நீலகிரி",
};

function main() {
  const [src, ...rest] = process.argv.slice(2);
  if (!src) {
    console.error('usage: node scripts/import-pincodes.mjs <official.json|official.csv> [--state "TAMIL NADU"]');
    process.exit(1);
  }
  const stateIdx = rest.indexOf("--state");
  const wantState = norm(stateIdx >= 0 ? rest[stateIdx + 1] : "TAMIL NADU");

  const records = loadRecords(src);
  if (records.length === 0) {
    console.error("no records found in the file");
    process.exit(1);
  }
  if (pick(records[0], "pincode", "pin code", "pin") === undefined) {
    console.error(`could not find a pincode field. Fields seen: ${Object.keys(records[0]).join(", ")}`);
    process.exit(1);
  }

  const rows = [];
  const unknownDistricts = new Set();
  for (const rec of records) {
    const state = pick(rec, "statename", "state", "state name");
    if (state !== undefined && norm(state) !== wantState) continue;
    const pin = String(pick(rec, "pincode", "pin code", "pin") ?? "").trim().match(/\d{6}/)?.[0];
    if (!pin) continue;
    const district = tidy(pick(rec, "districtname", "district", "district name"));
    const ta = DISTRICT_TAMIL[norm(district)] ?? "";
    if (!ta) unknownDistricts.add(district);
    rows.push([
      pin,
      tidy(pick(rec, "officename", "office name", "post office name")),
      String(pick(rec, "officetype", "office type") ?? "").trim().toUpperCase(),
      tidy(pick(rec, "taluk", "taluka", "sub district", "subdistrict")),
      district,
      ta,
    ]);
  }

  rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const esc = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = ["pincode,office_name,office_type,taluk,district,district_tamil", ...rows.map((r) => r.map(esc).join(","))].join("\n");
  writeFileSync(OUT, csv + "\n", "utf8");

  const pins = new Set(rows.map((r) => r[0]));
  console.log(`wrote ${OUT}`);
  console.log(`  ${rows.length} office rows, ${pins.size} distinct PIN codes`);
  if (unknownDistricts.size > 0) {
    console.log(`  ⚠ districts with no Tamil name (add to DISTRICT_TAMIL): ${[...unknownDistricts].join(", ")}`);
  }
}

main();
