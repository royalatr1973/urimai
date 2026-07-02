/**
 * Canonical seed data for the four launch schemes (curator-verified).
 *
 * Single source of truth in the domain `Scheme` shape: the Prisma seeder writes these
 * into Postgres, and tests can import them to evaluate against the REAL sourced rules
 * without a database. At runtime the app still loads schemes from the DB (the rules are
 * data, not code) — this constant is the seed input, not the runtime read path.
 *
 * ⚠️  All thresholds are curator-verified placeholders pending exact GO numbers — see the
 *     "Confirm before production" items tracked in each scheme's comments. verified: true
 *     reflects the curator's sign-off.
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
} satisfies Record<string, DocRef>;

export const SEED_SCHEMES: Scheme[] = [
  {
    id: "kmut",
    name: "Kalaignar Magalir Urimai Thogai",
    nameTamil: "கலைஞர் மகளிர் உரிமைத் தொகை",
    department: "Special Programme Implementation",
    benefit: "₹1,000 / month",
    note: "Monthly entitlement for the woman/transgender head of an eligible family. One per ration card.",
    applyAt: "e-Sevai centre, ration shop, or an UngaLudan Stalin camp",
    version: 1,
    effectiveFrom: "2023-09-15",
    source: "kmut.tn.gov.in; KMUT operational guidelines (SPI Dept)",
    verified: true,
    criteria: [
      { field: "gender", op: "in", value: ["female", "other"], label: "Woman or transgender applicant", source: "kmut.tn.gov.in" },
      { field: "age", op: "gte", value: 21, label: "Aged 21 or above", source: "KMUT operational guidelines" },
      { field: "is_family_head", op: "true", label: "Head of family on the ration card", source: "kmut.tn.gov.in" },
      { field: "is_tamil_nadu", op: "true", label: "Permanent resident of Tamil Nadu", source: "kmut.tn.gov.in" },
      { field: "annual_family_income", op: "lt", value: 250000, label: "Annual family income below ₹2.5 lakh", source: "KMUT operational guidelines" },
    ],
    exclusions: [
      { field: "land_acres_wet", op: "gt", value: 5, label: "Wetland holding above 5 acres", source: "KMUT operational guidelines" },
      { field: "land_acres_dry", op: "gt", value: 10, label: "Dryland holding above 10 acres", source: "KMUT operational guidelines" },
      { field: "annual_electricity_units", op: "gte", value: 3600, label: "Annual household electricity 3,600 units or more", source: "KMUT operational guidelines" },
      { field: "income_tax_payer", op: "true", label: "Income-tax payer in family", source: "KMUT operational guidelines" },
      { field: "professional_tax_payer", op: "true", label: "Professional-tax payer in family", source: "KMUT operational guidelines" },
      { field: "govt_employee", op: "true", label: "Govt employee in family", source: "KMUT operational guidelines" },
      { field: "psu_or_bank_employee", op: "true", label: "PSU or bank employee in family", source: "KMUT operational guidelines" },
      { field: "is_pensioner", op: "true", label: "Government pensioner in family", source: "KMUT operational guidelines" },
      { field: "elected_representative", op: "true", label: "Elected local-body representative in family", source: "KMUT operational guidelines" },
      { field: "owns_four_wheeler", op: "true", label: "Owns a four-wheeler (car/jeep/tractor/heavy vehicle)", source: "KMUT operational guidelines" },
    ],
    documents: [DOCS.ration_card, DOCS.aadhaar, DOCS.bank_passbook, DOCS.residence_proof],
  },
  {
    id: "oldage",
    name: "Old Age Pension (TN state — destitute)",
    nameTamil: "முதியோர் ஓய்வூதியம்",
    department: "Social Welfare & Women Empowerment / Revenue (CRA)",
    benefit: "₹1,000 / month",
    note: "Pension for destitute senior citizens with no regular means of support.",
    applyAt: "Taluk office (Revenue), e-Sevai centre, or CSC",
    version: 1,
    effectiveFrom: null,
    source: "cra.tn.gov.in; district .nic.in social-security pages",
    verified: true,
    criteria: [
      { field: "age", op: "gte", value: 60, label: "Aged 60 or above", source: "cra.tn.gov.in" },
      { field: "has_regular_income", op: "false", label: "Destitute — no regular source of income (assessed at application)", source: "cra.tn.gov.in" },
      { field: "fixed_assets_value", op: "lte", value: 50000, label: "Fixed assets ₹50,000 or below", source: "district social-security pages (.nic.in)" },
      { field: "is_tamil_nadu", op: "true", label: "Resident of Tamil Nadu", source: "cra.tn.gov.in" },
    ],
    exclusions: [],
    documents: [DOCS.aadhaar, DOCS.age_proof, DOCS.ration_card, DOCS.bank_passbook, DOCS.income_cert],
  },
  {
    id: "widow",
    name: "Destitute Widow Pension (TN state)",
    nameTamil: "ஆதரவற்ற விதவை ஓய்வூதியம்",
    department: "Social Welfare & Women Empowerment / Revenue (CRA)",
    benefit: "₹1,000 / month",
    note: "Pension for destitute widows with no sufficient means of support.",
    applyAt: "Taluk office (Revenue), e-Sevai centre, or CSC",
    version: 1,
    effectiveFrom: null,
    source: "cra.tn.gov.in; TN pension scheme details",
    verified: true,
    criteria: [
      { field: "gender", op: "eq", value: "female", label: "Applicant is a woman", source: "cra.tn.gov.in" },
      { field: "marital_status", op: "eq", value: "widowed", label: "Widowed", source: "cra.tn.gov.in" },
      { field: "age", op: "gte", value: 18, label: "Attained widowhood at 18 or above", source: "TN pension scheme details" },
      { field: "has_regular_income", op: "false", label: "Destitute — no regular source of income (assessed at application)", source: "cra.tn.gov.in" },
      { field: "fixed_assets_value", op: "lte", value: 50000, label: "Fixed assets ₹50,000 or below", source: "TN pension scheme details" },
      { field: "is_tamil_nadu", op: "true", label: "Resident of Tamil Nadu", source: "cra.tn.gov.in" },
    ],
    exclusions: [],
    documents: [DOCS.death_cert, DOCS.aadhaar, DOCS.ration_card, DOCS.bank_passbook, DOCS.income_cert],
  },
  {
    id: "disabled",
    name: "Differently Abled Pension (TN state — DAPS)",
    nameTamil: "மாற்றுத்திறனாளி ஓய்வூதியம்",
    department: "Welfare of Differently Abled / Revenue (CRA)",
    benefit: "₹1,000 / month",
    note: "Pension for unemployed persons with disability and limited means.",
    applyAt: "Taluk office (Revenue), e-Sevai centre, or CSC",
    version: 1,
    effectiveFrom: null,
    source: "cra.tn.gov.in; TN pension scheme details",
    verified: true,
    criteria: [
      { field: "disability_percent", op: "gte", value: 40, label: "Disability of 40% or more", source: "TN pension scheme details" },
      { field: "has_regular_income", op: "false", label: "Unemployed / no regular source of income (assessed at application)", source: "cra.tn.gov.in" },
      { field: "fixed_assets_value", op: "lte", value: 50000, label: "Fixed assets ₹50,000 or below", source: "TN pension scheme details" },
      { field: "is_tamil_nadu", op: "true", label: "Resident of Tamil Nadu", source: "cra.tn.gov.in" },
    ],
    exclusions: [],
    documents: [DOCS.disability_cert, DOCS.aadhaar, DOCS.ration_card, DOCS.bank_passbook, DOCS.income_cert],
  },
];
