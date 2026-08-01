/**
 * Convert the official India Post "All India Pincode Directory" into the Madal seed file.
 *
 *   node scripts/import-pincodes.mjs <official.csv> [--state "TAMIL NADU"]
 *     → writes data/tn_pincodes.csv
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

/** Find a column index by any of its known aliases. */
function col(header, ...aliases) {
  const want = aliases.map(norm);
  for (let i = 0; i < header.length; i++) if (want.includes(norm(header[i]))) return i;
  return -1;
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
    console.error("usage: node scripts/import-pincodes.mjs <official-pincode.csv> [--state \"TAMIL NADU\"]");
    process.exit(1);
  }
  const stateIdx = rest.indexOf("--state");
  const wantState = norm(stateIdx >= 0 ? rest[stateIdx + 1] : "TAMIL NADU");

  const lines = readFileSync(src, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]);

  const iPin = col(header, "pincode", "pin code", "pin");
  const iOffice = col(header, "officename", "office name", "post office name");
  const iType = col(header, "officetype", "office type");
  const iTaluk = col(header, "taluk", "taluka", "sub district", "subdistrict");
  const iDist = col(header, "districtname", "district", "district name");
  const iState = col(header, "statename", "state", "state name");
  if (iPin < 0 || iDist < 0) {
    console.error(`could not find pincode/district columns in: ${header.join(", ")}`);
    process.exit(1);
  }

  const rows = [];
  const unknownDistricts = new Set();
  for (const line of lines.slice(1)) {
    const f = parseCsvLine(line);
    if (iState >= 0 && norm(f[iState]) !== wantState) continue;
    const pin = String(f[iPin] ?? "").trim().match(/\d{6}/)?.[0];
    if (!pin) continue;
    const district = tidy(f[iDist]);
    const ta = DISTRICT_TAMIL[norm(district)] ?? "";
    if (!ta) unknownDistricts.add(district);
    rows.push([
      pin,
      tidy(iOffice >= 0 ? f[iOffice] : ""),
      String(iType >= 0 ? f[iType] : "").trim().toUpperCase(),
      tidy(iTaluk >= 0 ? f[iTaluk] : ""),
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
