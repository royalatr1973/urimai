/**
 * Urimai core domain types — the single source of truth shared across packages.
 *
 * These mirror the data model in PROJECT_BRIEF.md §5, extended by the curator
 * verification pass (asset-cap + destitution pension gates, KMUT family disqualifiers,
 * and the `in` set operator).
 *
 * Design invariants (enforced elsewhere, documented here):
 *  - The rules engine is a PURE function `evaluate(profile, scheme): Verdict`.
 *    Eligibility verdicts come from rules, NEVER from the LLM.
 *  - Eligibility thresholds are DATA (stored versioned in Postgres), never code.
 *    Every threshold carries a `source` and the scheme carries a `verified` flag.
 *  - Discovery holds NO identity/PII. Profile never contains identifying fields.
 */

/** What we learn about the person. Discovery stage holds NO identity/PII. */
export type Profile = {
  age: number | null;
  gender: "male" | "female" | "other" | null;
  marital_status: "married" | "widowed" | "unmarried" | "divorced" | null;
  state: string | null;
  is_tamil_nadu: boolean | null; // derived from state/district
  disability_percent: number | null;
  is_family_head: boolean | null;
  income_tax_payer: boolean | null;
  govt_employee: boolean | null;
  owns_four_wheeler: boolean | null;

  // Informational only — shown in the web UI, NOT a binding pension criterion.
  // The binding pension gate is `has_regular_income` + `fixed_assets_value`.
  monthly_income: number | null;

  // --- Pension destitution / asset gate ---
  fixed_assets_value: number | null; // ₹ — pension fixed-asset cap
  has_regular_income: boolean | null; // destitution signal; true ⇒ likely NOT destitute.
  //                                     Final destitution is field-assessed at application.

  // --- KMUT family eligibility ---
  annual_family_income: number | null; // ₹/year
  land_acres_wet: number | null; // replaces the old single land_acres
  land_acres_dry: number | null; // replaces the old single land_acres
  annual_electricity_units: number | null;
  professional_tax_payer: boolean | null;
  is_pensioner: boolean | null;
  psu_or_bank_employee: boolean | null;
  elected_representative: boolean | null;
};

/**
 * Comparison operators a rule can express.
 * For "in", `value` is an array and the rule passes if the field value ∈ value.
 */
export type RuleOp = "eq" | "gte" | "lte" | "gt" | "lt" | "true" | "false" | "in";

/** One eligibility condition, evaluated against a single Profile field. */
export type Rule = {
  field: keyof Profile;
  op: RuleOp;
  value?: string | number | boolean | Array<string | number>;
  label: string; // human-readable reason, used in voice + UI
  source?: string; // GO citation for this specific threshold
};

/** A document shown as a picture and walked through by voice. */
export type DocRef = {
  id: string; // e.g. "ration_card"
  nameTamil: string;
  nameEnglish: string;
  imageAssetId: string; // recognizable picture for the text-free card
  whereToGet: string; // spoken if the user lacks it
};

/** A scheme's rules — the asset. Stored versioned in Postgres. */
export type Scheme = {
  id: string;
  name: string; // English
  nameTamil: string;
  department: string;
  benefit: string; // e.g. "₹1,000 / month"
  note: string;
  criteria: Rule[]; // ALL must pass to be eligible
  exclusions: Rule[]; // ANY true disqualifies
  documents: DocRef[]; // shown as pictures, walked through by voice
  applyAt: string;
  version: number;
  effectiveFrom: string | null; // date the GO took effect (ISO), or null if unknown
  source: string; // GO number / URL
  verified: boolean; // false until a human signs off
};

/** The outcome of evaluating one Profile against one Scheme. */
export type Verdict = {
  schemeId: string;
  status: "eligible" | "need_info" | "not_eligible";
  reasons: string[]; // from Rule.label
  missingFields: (keyof Profile)[]; // drives the next question
  ruleVersion: number; // logged to audit
};

/** An empty profile — the safe fallback when nothing is known yet. */
export const EMPTY_PROFILE: Profile = {
  age: null,
  gender: null,
  marital_status: null,
  state: null,
  is_tamil_nadu: null,
  disability_percent: null,
  is_family_head: null,
  income_tax_payer: null,
  govt_employee: null,
  owns_four_wheeler: null,
  monthly_income: null,
  fixed_assets_value: null,
  has_regular_income: null,
  annual_family_income: null,
  land_acres_wet: null,
  land_acres_dry: null,
  annual_electricity_units: null,
  professional_tax_payer: null,
  is_pensioner: null,
  psu_or_bank_employee: null,
  elected_representative: null,
};
