/**
 * Test fixtures for the rules engine — deliberately INDEPENDENT of the DB seed.
 *
 * The numbers here are arbitrary test thresholds, not legal values; the engine never
 * sees the real (unverified) scheme data in these tests. This keeps the engine's
 * behaviour pinned to fixtures we fully control.
 */
import { EMPTY_PROFILE, type Profile, type Scheme } from "@urimai/types";

/** Build a complete Profile from a partial override (rest stay null/unknown). */
export function profile(overrides: Partial<Profile> = {}): Profile {
  return { ...EMPTY_PROFILE, ...overrides };
}

/** Build a Scheme fixture with sensible defaults. */
export function scheme(overrides: Partial<Scheme>): Scheme {
  return {
    id: "fixture_scheme",
    name: "Fixture Scheme",
    nameTamil: "மாதிரி திட்டம்",
    department: "Test Dept",
    benefit: "₹1 / month",
    note: "",
    criteria: [],
    exclusions: [],
    documents: [],
    applyAt: "nowhere",
    version: 1,
    effectiveFrom: "2024-01-01",
    source: "TEST",
    verified: false,
    ...overrides,
  };
}

// --- Old-age pension fixture (gte / lte, two exclusions) ---------------------
export const OLD_AGE = scheme({
  id: "old_age",
  name: "Old Age Pension",
  version: 3,
  criteria: [
    { field: "is_tamil_nadu", op: "true", label: "Resident of Tamil Nadu" },
    { field: "age", op: "gte", value: 60, label: "Aged 60 or above" },
    { field: "monthly_income", op: "lte", value: 5000, label: "Monthly income within the limit" },
  ],
  exclusions: [
    { field: "income_tax_payer", op: "true", label: "Income-tax payers are not eligible" },
    { field: "govt_employee", op: "true", label: "Government employees are not eligible" },
  ],
});

// --- Destitute widow pension fixture (eq on string fields) -------------------
export const WIDOW = scheme({
  id: "widow",
  name: "Destitute Widow Pension",
  version: 2,
  criteria: [
    { field: "is_tamil_nadu", op: "true", label: "Resident of Tamil Nadu" },
    { field: "gender", op: "eq", value: "female", label: "Applicant is a woman" },
    { field: "marital_status", op: "eq", value: "widowed", label: "Applicant is a widow" },
    { field: "monthly_income", op: "lte", value: 5000, label: "Monthly income within the limit" },
  ],
  exclusions: [
    { field: "income_tax_payer", op: "true", label: "Income-tax payers are not eligible" },
  ],
});

// --- Differently-abled pension fixture --------------------------------------
export const DISABILITY = scheme({
  id: "disability",
  name: "Differently-Abled Pension",
  version: 1,
  criteria: [
    { field: "is_tamil_nadu", op: "true", label: "Resident of Tamil Nadu" },
    { field: "disability_percent", op: "gte", value: 40, label: "Disability 40% or above" },
    { field: "monthly_income", op: "lte", value: 5000, label: "Monthly income within the limit" },
  ],
  exclusions: [
    { field: "govt_employee", op: "true", label: "Government employees are not eligible" },
  ],
});

// --- Operator-coverage fixture: exercises gt, lt, false, and eq(boolean) ----
export const OP_COVERAGE = scheme({
  id: "op_coverage",
  name: "Operator Coverage",
  version: 1,
  criteria: [
    { field: "land_acres_wet", op: "lt", value: 5, label: "Owns less than 5 wet acres" },
    { field: "disability_percent", op: "gt", value: 0, label: "Has some disability" },
    { field: "income_tax_payer", op: "false", label: "Is not an income-tax payer" },
    { field: "is_family_head", op: "eq", value: true, label: "Is the family head" },
  ],
  exclusions: [],
});

// --- "in" set-operator fixture (KMUT-style gender set) -----------------------
export const IN_OP = scheme({
  id: "in_op",
  name: "Set Operator",
  version: 1,
  criteria: [
    { field: "gender", op: "in", value: ["female", "other"], label: "Woman or transgender applicant" },
  ],
  exclusions: [],
});

// --- Extended-model fixture: destitution + asset cap + new disqualifiers -----
// Arbitrary test thresholds (mechanism, not real scheme data).
export const EXTENDED = scheme({
  id: "extended",
  name: "Extended Model",
  version: 1,
  criteria: [
    { field: "has_regular_income", op: "false", label: "Destitute — no regular income (assessed at application)" },
    { field: "fixed_assets_value", op: "lte", value: 50000, label: "Fixed assets within the cap" },
    { field: "annual_family_income", op: "lt", value: 250000, label: "Annual family income below the cap" },
  ],
  exclusions: [
    { field: "land_acres_wet", op: "gt", value: 5, label: "Wetland holding above 5 acres" },
    { field: "land_acres_dry", op: "gt", value: 10, label: "Dryland holding above 10 acres" },
    { field: "annual_electricity_units", op: "gte", value: 3600, label: "Annual electricity 3,600 units or more" },
    { field: "professional_tax_payer", op: "true", label: "Professional-tax payer" },
    { field: "is_pensioner", op: "true", label: "Government pensioner" },
    { field: "psu_or_bank_employee", op: "true", label: "PSU or bank employee" },
    { field: "elected_representative", op: "true", label: "Elected local-body representative" },
  ],
});
