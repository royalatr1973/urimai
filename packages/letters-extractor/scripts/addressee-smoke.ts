/**
 * Live smoke test for the addressee web search (manual verification):
 *
 *   pnpm --filter @urimai/letters-extractor addressee:smoke   # needs ANTHROPIC_API_KEY
 *
 * Runs real web searches (restricted to gov.in/nic.in) for two scenarios and prints
 * what was found, with sources — eyeball that the offices and addresses are real.
 * Real API + web search tokens. Not part of the automated suite.
 */
import { SEED_LETTER_TYPES } from "@urimai/letter-types";
import { searchAddressee } from "../src/addressee.js";

const scenarios = [
  {
    label: "Police complaint, Cuddalore (theft)",
    typeId: "police_complaint",
    facts: { letterTypeId: "police_complaint", language: null, incident_place: "கடலூர்", sender_address: "கடலூர் பழைய பஸ் ஸ்டாண்ட் பக்கம்" },
  },
  {
    label: "Civic grievance, Dindigul (drainage)",
    typeId: "civic_grievance",
    facts: { letterTypeId: "civic_grievance", language: null, incident_place: "திண்டுக்கல்", sender_address: "காமராஜர் தெரு, திண்டுக்கல்" },
  },
];

for (const s of scenarios) {
  const type = SEED_LETTER_TYPES.find((t) => t.id === s.typeId)!;
  console.log(`\n=== ${s.label} ===`);
  const r = await searchAddressee(type, s.facts as never);
  if (r.to) {
    console.log("TO:", r.to.designationTamil, r.to.designation ? `(${r.to.designation})` : "");
    for (const l of r.to.addressLines) console.log("    " + l);
    console.log("    pincode:", r.to.pincode, "| source:", r.to.source);
  } else {
    console.log("TO: (not found — directory fallback would apply)");
  }
  for (const c of r.cc) {
    console.log("CC:", c.designationTamil, "| source:", c.source);
  }
}
