/**
 * Canonical seed data for the six launch schemes (curator-verified July 2026).
 *
 * Source: TN Social Security Schemes document supplied by the curator (July 2026),
 * summarising KMUT (kmut.tn.gov.in), CRA (cra.tn.gov.in), central IGNOAPS/IGNWPS/IGNDPS
 * and myScheme.gov.in. Verified: true per the curator's line-by-line sign-off.
 *
 * Single source of truth in the domain `Scheme` shape: the Prisma seeder writes these
 * into Postgres, and tests can import them to evaluate against the REAL sourced rules
 * without a database. At runtime the app still loads schemes from the DB — this constant
 * is the seed input, not the runtime read path.
 *
 * KMUT changes (July 2026): the "head of family" requirement is now an OR — the applicant
 * is eligible if she is EITHER the ration-card head OR a married woman (i.e. wife of a
 * male head). Encoded with the new "any" operator on the rules engine.
 *
 * Old Age Pension (July 2026): now requires BPL. The earlier fixed-assets ≤ ₹50,000 gate
 * has been removed — the document treats it as the combined IGNOAPS + state scheme.
 *
 * DAPS (July 2026): adds an annual_family_income ≤ ₹3 lakh cap and drops the fixed-assets
 * gate — the document doesn't cite it for DAPS.
 *
 * Central schemes folded in (curator decision, July 2026): IGNWPS and IGNDPS are NOT
 * separate citizen-facing schemes. In TN they are funding streams inside the same widow /
 * disability pension — same ₹1,000, same taluk office, same officer, who assigns the
 * central or state bucket himself. Modelling them separately produced only subset schemes
 * (IGNWPS ⊂ DWPS, IGNDPS ⊂ DAPS) that could never change a verdict, plus hybrid criteria
 * that matched neither NSAP nor TN sources. Old Age already models IGNOAPS+state as one
 * scheme; widow (v3) and disabled (v3) now do the same, with the central stream noted in
 * `note` text only. Re-split only if Urimai ever goes multi-state.
 *
 * disabled v3 also adds the age ≥ 18 floor (TN destitute differently-abled pension is 18+
 * per district Revenue pages) — previously a minor could be marked "may be eligible".
 */
import type { DocRef, Scheme } from "@urimai/types";

const img = (id: string) => `PLACEHOLDER_${id}`;

const DOCS = {
  ration_card: { id: "ration_card", nameTamil: "குடும்ப அட்டை", nameEnglish: "Ration (family) card", imageAssetId: img("ration_card"), whereToGet: "TN PDS / e-Sevai" },
  aadhaar: { id: "aadhaar", nameTamil: "ஆதார் கார்டு", nameEnglish: "Aadhaar (must be bank-linked for DBT)", imageAssetId: img("aadhaar"), whereToGet: "Aadhaar Seva Kendra" },
  bank_passbook: { id: "bank_passbook", nameTamil: "வங்கி பாஸ்புக்", nameEnglish: "Bank passbook", imageAssetId: img("bank_passbook"), whereToGet: "Your bank branch" },
  residence_proof: { id: "residence_proof", nameTamil: "முகவரி சான்று", nameEnglish: "Residence proof", imageAssetId: img("residence_proof"), whereToGet: "e-Sevai" },
  age_proof: { id: "age_proof", nameTamil: "வயது சான்று", nameEnglish: "Age proof", imageAssetId: img("age_proof"), whereToGet: "e-Sevai" },
  income_cert: { id: "income_cert", nameTamil: "வருமான / ஆதரவற்ற சான்று", nameEnglish: "Income / destitution certificate", imageAssetId: img("income_cert"), whereToGet: "Taluk office" },
  death_cert: { id: "death_cert", nameTamil: "கணவர் இறப்பு சான்றிதழ்", nameEnglish: "Husband's death certificate", imageAssetId: img("death_cert"), whereToGet: "Local body / e-Sevai" },
  disability_cert: { id: "disability_cert", nameTamil: "மாற்றுத்திறன் சான்றிதழ் (UDID)", nameEnglish: "Disability certificate (UDID)", imageAssetId: img("disability_cert"), whereToGet: "Govt hospital / UDID portal" },
  voter_id: { id: "voter_id", nameTamil: "வாக்காளர் அடையாள அட்டை", nameEnglish: "Voter ID card", imageAssetId: img("voter_id"), whereToGet: "Electoral office" },
  bpl_card: { id: "bpl_card", nameTamil: "BPL அட்டை", nameEnglish: "BPL card / number", imageAssetId: img("bpl_card"), whereToGet: "Corporation office (urban) / BDO or panchayat (rural)" },
  destitute_widow_cert: { id: "destitute_widow_cert", nameTamil: "ஆதரவற்ற விதவை சான்றிதழ்", nameEnglish: "Destitute Widow Certificate (REV-109)", imageAssetId: img("destitute_widow_cert"), whereToGet: "Revenue Department" },
} satisfies Record<string, DocRef>;

const SRC = "TN Social Security Schemes document (curator, July 2026)";

export const SEED_SCHEMES: Scheme[] = [
  // 1 ──────────────────────────────────────────────────────────────────────
  {
    id: "kmut",
    name: "Kalaignar Magalir Urimai Thogai",
    nameTamil: "கலைஞர் மகளிர் உரிமைத் தொகை",
    department: "Special Programme Implementation",
    benefit: "₹1,000 / month",
    note: "Monthly entitlement for the woman/transgender head of an eligible family. Married women qualify as wives of the male head; widowed/unmarried women must themselves be the head. One woman per ration card (enforced at apply-stage).",
    applyAt: "kmut.tn.gov.in, e-Sevai centre, or UngaLudan Stalin camp",
    version: 2,
    effectiveFrom: "2023-09-15",
    source: SRC,
    verified: true,
    criteria: [
      { op: "in", field: "gender", value: ["female", "other"], label: "Woman or transgender applicant", source: SRC },
      { op: "gte", field: "age", value: 21, label: "Aged 21 or above", source: SRC },
      { op: "true", field: "is_tamil_nadu", label: "Permanent resident of Tamil Nadu", source: SRC },
      { op: "lt", field: "annual_family_income", value: 250000, label: "Annual family income below ₹2.5 lakh", source: SRC },
      // OR: the applicant is a married woman (wife of the male ration-card head) OR she is
      // herself the recognised head. Widowed/unmarried women must be heads.
      {
        op: "any",
        label: "Head of family, or a married woman (wife of head)",
        source: SRC,
        rules: [
          { op: "eq", field: "marital_status", value: "married", label: "Married woman (wife of head)", source: SRC },
          { op: "true", field: "is_family_head", label: "Head of family on the ration card", source: SRC },
        ],
      },
    ],
    exclusions: [
      { op: "gt", field: "land_acres_wet", value: 5, label: "Wetland holding above 5 acres", source: SRC },
      { op: "gt", field: "land_acres_dry", value: 10, label: "Dryland holding above 10 acres", source: SRC },
      { op: "gte", field: "annual_electricity_units", value: 3600, label: "Annual household electricity 3,600 units or more", source: SRC },
      { op: "true", field: "income_tax_payer", label: "Income-tax payer in family", source: SRC },
      { op: "true", field: "professional_tax_payer", label: "Professional-tax payer in family", source: SRC },
      { op: "true", field: "govt_employee", label: "Govt employee in family", source: SRC },
      { op: "true", field: "psu_or_bank_employee", label: "PSU or bank employee in family", source: SRC },
      { op: "true", field: "is_pensioner", label: "Government pensioner in family", source: SRC },
      { op: "true", field: "elected_representative", label: "Elected local-body representative in family", source: SRC },
      { op: "true", field: "owns_four_wheeler", label: "Owns a four-wheeler (car/jeep/tractor/heavy vehicle)", source: SRC },
    ],
    documents: [DOCS.ration_card, DOCS.aadhaar, DOCS.bank_passbook, DOCS.residence_proof],
  },

  // 2 ──────────────────────────────────────────────────────────────────────
  {
    id: "oldage",
    name: "Old Age Pension (IGNOAPS + TN state)",
    nameTamil: "முதியோர் ஓய்வூதியம்",
    department: "Revenue (CRA) / Social Welfare",
    benefit: "₹1,000 / month",
    note: "Pension for destitute senior citizens in BPL families. Value of a free house given under a government scheme is not counted.",
    applyAt: "Taluk office (Revenue), e-Sevai centre, or CSC",
    version: 2,
    effectiveFrom: null,
    source: SRC,
    verified: true,
    criteria: [
      { op: "gte", field: "age", value: 60, label: "Aged 60 or above", source: SRC },
      { op: "false", field: "has_regular_income", label: "Destitute — no regular source of income (assessed at application)", source: SRC },
      { op: "true", field: "is_bpl", label: "Below Poverty Line (BPL) family", source: SRC },
      { op: "true", field: "is_tamil_nadu", label: "Resident of Tamil Nadu", source: SRC },
    ],
    exclusions: [],
    documents: [DOCS.aadhaar, DOCS.age_proof, DOCS.ration_card, DOCS.bank_passbook, DOCS.voter_id, DOCS.bpl_card],
  },

  // 3 ──────────────────────────────────────────────────────────────────────
  {
    id: "widow",
    name: "Destitute Widow Pension (DWPS — TN state)",
    nameTamil: "ஆதரவற்ற விதவை ஓய்வூதியம்",
    department: "Revenue (CRA) / Social Welfare",
    benefit: "₹1,000 / month",
    note: "Pension for destitute widows in Tamil Nadu (18+). Central IGNWPS funding (BPL widows 40+) is part of this same pension — the officer assigns the funding stream; the amount and office are identical. Widows aged 60+ may be routed to Old Age Pension by the officer.",
    applyAt: "TNeGA e-Sevai (REV-202) / e-Sevai Maiyam / CSC",
    version: 3,
    effectiveFrom: null,
    source: SRC,
    verified: true,
    criteria: [
      { op: "eq", field: "gender", value: "female", label: "Applicant is a woman", source: SRC },
      { op: "eq", field: "marital_status", value: "widowed", label: "Widowed (not remarried)", source: SRC },
      { op: "gte", field: "age", value: 18, label: "Aged 18 or above", source: SRC },
      { op: "false", field: "has_regular_income", label: "Destitute — no adequate means of livelihood (assessed at application)", source: SRC },
      { op: "lte", field: "fixed_assets_value", value: 50000, label: "Fixed assets ₹50,000 or below", source: SRC },
      { op: "true", field: "is_tamil_nadu", label: "Resident of Tamil Nadu", source: SRC },
    ],
    exclusions: [],
    documents: [DOCS.death_cert, DOCS.destitute_widow_cert, DOCS.aadhaar, DOCS.ration_card, DOCS.bank_passbook, DOCS.income_cert, DOCS.voter_id],
  },

  // 4 ──────────────────────────────────────────────────────────────────────
  {
    id: "disabled",
    name: "Differently Abled Pension (DAPS — TN state)",
    nameTamil: "மாற்றுத்திறனாளி ஓய்வூதியம்",
    department: "Revenue (CRA) / Welfare of Differently Abled",
    benefit: "₹1,000 / month",
    note: "Pension for unemployed persons (18+) with 40%+ disability and family income ≤ ₹3 lakh. Requires UDID / disability passbook. Central IGNDPS funding (80%+ disability, BPL) is part of this same pension — the officer assigns the funding stream; the amount and office are identical.",
    applyAt: "Taluk office (Revenue), e-Sevai centre, or CSC",
    version: 3,
    effectiveFrom: null,
    source: SRC,
    verified: true,
    criteria: [
      { op: "gte", field: "age", value: 18, label: "Aged 18 or above", source: "TN district Revenue pages (destitute differently-abled pension, 18+)" },
      { op: "gte", field: "disability_percent", value: 40, label: "Disability of 40% or more", source: SRC },
      { op: "false", field: "has_regular_income", label: "Unemployed / no regular source of income", source: SRC },
      { op: "lte", field: "annual_family_income", value: 300000, label: "Annual family income ₹3 lakh or below", source: SRC },
      { op: "true", field: "is_tamil_nadu", label: "Resident of Tamil Nadu", source: SRC },
    ],
    exclusions: [],
    documents: [DOCS.disability_cert, DOCS.aadhaar, DOCS.ration_card, DOCS.bank_passbook, DOCS.income_cert, DOCS.voter_id],
  },

  // Central IGNWPS / IGNDPS were retired as separate schemes in July 2026 —
  // folded into widow v3 / disabled v3 above. See the header comment.
];
