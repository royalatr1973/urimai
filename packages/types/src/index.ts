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

  // --- Below Poverty Line status ---
  // Required for Old Age Pension (modelled as IGNOAPS + TN state combined). BPL status is
  // issued by the local corporation (urban) or BDO / panchayat office (rural). Boolean
  // answer suffices for eligibility; the certificate itself is collected at apply-stage.
  is_bpl: boolean | null;
};

/**
 * Operators available on a single-field rule.
 * For "in", `value` is an array and the rule passes if the field value ∈ value.
 */
export type FieldOp = "eq" | "gte" | "lte" | "gt" | "lt" | "true" | "false" | "in";

/** Every operator a rule can have — field ops plus the "any" combinator below. */
export type RuleOp = FieldOp | "any";

/** A single-field condition — the workhorse rule shape. */
export type FieldRule = {
  op: FieldOp;
  field: keyof Profile;
  value?: string | number | boolean | Array<string | number>;
  label: string;
  source?: string;
};

/**
 * An OR-of-criteria rule: passes if ANY of its sub-rules pass. Introduced for KMUT's
 * "married OR is_family_head" clause per the July-2026 curator verification against the
 * TN social-security document — the ration-card female head OR the wife of a male head
 * both qualify. Kept intentionally shallow (sub-rules are field rules, not nested any).
 */
export type AnyRule = {
  op: "any";
  rules: FieldRule[];
  label: string;
  source?: string;
};

/** One eligibility condition. Discriminated by `op`. */
export type Rule = FieldRule | AnyRule;

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

// ---------------------------------------------------------------------------
// Madal (letters) domain types — LETTERS_BRIEF.md §6.
//
// Design invariants (enforced elsewhere, documented here):
//  - The LLM drafts; the USER decides. Nothing is delivered without explicit,
//    logged approval.
//  - Legal citations come ONLY from the LetterType record, never from the model.
//  - The letter skeleton is rendered deterministically; the LLM writes only
//    body paragraphs, and only from facts the user actually said.
// ---------------------------------------------------------------------------

/** A fact the letter flow can collect. The gap loop asks for missing required ones. */
export type FactKey =
  | "sender_name"
  | "sender_address"
  | "sender_pincode"
  | "sender_phone"
  | "addressee_name"
  | "addressee_office"
  | "addressee_address"
  | "subject"
  | "incident_date"
  | "incident_place"
  | "incident_details"
  | "prior_attempts"
  | "amount"
  | "reference_ids"
  | "relief_sought"
  | "attachments"
  | "copy_to";

/** Every collectable fact key, in canonical order — for validation and prompt building. */
export const FACT_KEYS: FactKey[] = [
  "sender_name",
  "sender_address",
  "sender_pincode",
  "sender_phone",
  "addressee_name",
  "addressee_office",
  "addressee_address",
  "subject",
  "incident_date",
  "incident_place",
  "incident_details",
  "prior_attempts",
  "amount",
  "reference_ids",
  "relief_sought",
  "attachments",
  "copy_to",
];

/** A letter type — the asset. DB-backed, versioned, human-verified, like Scheme. */
export type LetterType = {
  id: string; // "rti_request" | "police_complaint" | ... | "generic_petition"
  nameTamil: string;
  nameEnglish: string;
  addresseeHint: string; // who this normally goes to; drives the addressee question
  requiredFacts: FactKey[]; // gap loop asks these, one at a time
  optionalFacts: FactKey[];
  languageDefault: "ta" | "en" | "bilingual";
  legalRefs: { label: string; citation: string; source: string }[]; // ONLY source of citations
  bodyGuidance: string; // tone/structure notes injected into the drafting prompt
  version: number;
  verified: boolean; // false until a human reviews the template + refs
};

/**
 * A curator-maintained government office — the addressee directory (July 2026).
 * DB-backed, versioned, human-verified like schemes and letter types. Used as the
 * To-address when the user doesn't know the office, and as curated நகல் (CC)
 * recipients per letter type. NEVER filled from web search at runtime.
 */
export type Office = {
  id: string; // stable key, e.g. "tn_cm_cell"
  designation: string;
  designationTamil: string;
  department: string;
  addressLines: string[];
  pincode: string | null;
  phone: string | null;
  email: string | null;
  level: string; // "state" | "district" | "taluk"
  district: string | null; // null for state-level
  handles: string[]; // letter-type ids this office can receive (To)
  ccFor: string[]; // letter-type ids this office should be copied on
  version: number;
  source: string; // official URL the entry was taken from
  verified: boolean; // false until a human confirms designation + address
  notes: string;
};

/**
 * A curator-authored grievance category (July 2026, 300 rows): fine-grained
 * classification vocabulary + the competent-authority escalation chain. DB-backed,
 * versioned, human-verified like everything else. The chain answers WHO acts on a
 * matter (To) and who supervises (cc, ordered upward) — designations, not addresses.
 */
export type GrievanceCategory = {
  id: string; // stable key, e.g. "patta_transfer"
  issueExamples: string[]; // real-world phrasings for classification
  to: string; // competent first-stop designation, e.g. "Tahsildar"
  cc: string[]; // supervisory chain above it, nearest first
  /** Case data this grievance needs (e.g. survey_number, deceased_name) — asked one at a time. */
  entitiesRequired: string[];
  version: number;
  source: string;
  verified: boolean;
};

/** What we learn from the user. All nullable; the gap loop fills required ones. */
export type LetterFacts = Partial<Record<FactKey, string>> & {
  letterTypeId: string | null; // classified, user-confirmable
  language: "ta" | "en" | "bilingual" | null;
  /** Category-specific case data (keys from GrievanceCategory.entitiesRequired), captured verbatim. */
  entities?: Record<string, string>;
};

/** Structured draft — blocks, so read-back can chunk and corrections can target a block. */
export type LetterDraft = {
  letterTypeId: string;
  typeVersion: number;
  senderBlock: string;
  date: string;
  addresseeBlock: string;
  subject: string;
  salutation: string;
  bodyParagraphs: string[]; // the ONLY LLM-authored part
  closing: string;
  signatureLine: string; // supports thumb-impression wording
  /** "நகல்:" (copy-to) recipients — user's words first, then curated/found offices; null when none. */
  copyTo: string | null;
  // NOTE: the AI-assistance disclaimer is deliberately NOT part of the letter
  // (live-tester decision, July 2026) — it is spoken to the USER during read-back
  // and included in the delivery caption, but never printed on the document.
  language: "ta" | "en" | "bilingual";
};

/**
 * A minimal addressee/CC office shape shared by the curator directory (Office) and
 * web-search-found offices — everything the letter renderer needs.
 */
export type OfficeAddress = {
  designationTamil: string;
  designation?: string;
  addressLines: string[];
  pincode?: string | null;
  /** Where this address came from (official URL or directory key) — logged, never printed. */
  source?: string;
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
  is_bpl: null,
};

export { districtForPincode, normalizePincode, senderPincode, stateForPincode, talukForPincode } from "./pincode.js";
export { lookupPincode, type PincodePlace } from "./pincode-data.js";
