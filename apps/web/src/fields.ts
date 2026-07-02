import type { ProfileField } from "./types";

// Presentation metadata only — Tamil-first labels and input kinds for the editable fact
// fields. This is form UI, NOT eligibility logic: no thresholds, no scheme rules.

export type FieldKind = "number" | "boolean" | "enum";

export interface FieldMeta {
  key: ProfileField;
  ta: string;
  en: string;
  kind: FieldKind;
  options?: Array<{ value: string; ta: string; en: string }>;
}

const gender = [
  { value: "female", ta: "பெண்", en: "Woman" },
  { value: "male", ta: "ஆண்", en: "Man" },
  { value: "other", ta: "திருநங்கை / பிற", en: "Transgender / other" },
];

const marital = [
  { value: "married", ta: "திருமணமானவர்", en: "Married" },
  { value: "widowed", ta: "விதவை", en: "Widowed" },
  { value: "unmarried", ta: "திருமணமாகாதவர்", en: "Unmarried" },
  { value: "divorced", ta: "விவாகரத்து", en: "Divorced" },
];

export const FIELD_META: FieldMeta[] = [
  { key: "is_tamil_nadu", ta: "தமிழ்நாட்டில் வசிக்கிறீர்களா?", en: "Resident of Tamil Nadu", kind: "boolean" },
  { key: "age", ta: "வயது", en: "Age", kind: "number" },
  { key: "gender", ta: "பாலினம்", en: "Gender", kind: "enum", options: gender },
  { key: "marital_status", ta: "திருமண நிலை", en: "Marital status", kind: "enum", options: marital },
  { key: "disability_percent", ta: "மாற்றுத்திறன் சதவீதம்", en: "Disability %", kind: "number" },
  { key: "has_regular_income", ta: "நிலையான வருமானம் உள்ளதா?", en: "Has a steady income", kind: "boolean" },
  { key: "fixed_assets_value", ta: "சொத்து மதிப்பு (₹)", en: "Fixed assets value (₹)", kind: "number" },
  { key: "is_family_head", ta: "குடும்பத் தலைவரா?", en: "Head of family", kind: "boolean" },
  { key: "annual_family_income", ta: "ஆண்டு குடும்ப வருமானம் (₹)", en: "Annual family income (₹)", kind: "number" },
  { key: "land_acres_wet", ta: "நஞ்சை நிலம் (ஏக்கர்)", en: "Wet land (acres)", kind: "number" },
  { key: "land_acres_dry", ta: "புஞ்சை நிலம் (ஏக்கர்)", en: "Dry land (acres)", kind: "number" },
  { key: "annual_electricity_units", ta: "ஆண்டு மின்சாரம் (யூனிட்)", en: "Annual electricity (units)", kind: "number" },
  { key: "owns_four_wheeler", ta: "நான்கு சக்கர வாகனம் உள்ளதா?", en: "Owns a four-wheeler", kind: "boolean" },
  { key: "income_tax_payer", ta: "வருமான வரி கட்டுகிறீர்களா?", en: "Income-tax payer", kind: "boolean" },
  { key: "professional_tax_payer", ta: "தொழில் வரி கட்டுகிறீர்களா?", en: "Professional-tax payer", kind: "boolean" },
  { key: "govt_employee", ta: "அரசு ஊழியரா?", en: "Government employee", kind: "boolean" },
  { key: "psu_or_bank_employee", ta: "பொதுத்துறை / வங்கி ஊழியரா?", en: "PSU / bank employee", kind: "boolean" },
  { key: "is_pensioner", ta: "அரசு ஓய்வூதியம் பெறுகிறீர்களா?", en: "Government pensioner", kind: "boolean" },
  { key: "elected_representative", ta: "தேர்ந்தெடுக்கப்பட்ட பிரதிநிதியா?", en: "Elected representative", kind: "boolean" },
  { key: "monthly_income", ta: "மாத வருமானம் (₹)", en: "Monthly income (₹, informational)", kind: "number" },
];

export const FIELD_BY_KEY: Record<string, FieldMeta> = Object.fromEntries(
  FIELD_META.map((f) => [f.key, f]),
);
