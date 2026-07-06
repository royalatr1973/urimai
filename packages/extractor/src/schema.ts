/**
 * Robust parsing + validation of the model's output into a Profile.
 *
 * Guarantees (PROJECT_BRIEF.md Phase 2): strict zod validation, and a SAFE FALLBACK to
 * an empty profile — malformed model output never throws. Validation is field-by-field:
 * one bad field becomes null rather than discarding the whole profile, and unknown keys
 * are ignored. `is_tamil_nadu` is derived from `state` here, never trusted from the model.
 */
import { z } from "zod";
import { EMPTY_PROFILE, type Profile } from "@urimai/types";

// --- field validators --------------------------------------------------------

const genderSchema = z.enum(["male", "female", "other"]);
const maritalSchema = z.enum(["married", "widowed", "unmarried", "divorced"]);

/** Coerce a value to a finite number, tolerating "1,200", "₹1200", "0.5". null otherwise. */
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.\-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** A number within [min, max] (inclusive), else null. */
function boundedNumber(v: unknown, min: number, max: number): number | null {
  const n = toNumber(v);
  if (n === null) return null;
  return n >= min && n <= max ? n : null;
}

/** A strict boolean, tolerating the strings "true"/"false". null otherwise. */
function toBoolean(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return null;
}

function toEnum<T extends string>(v: unknown, schema: z.ZodEnum<[T, ...T[]]>): T | null {
  const r = schema.safeParse(v);
  return r.success ? r.data : null;
}

function toState(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

/** Derive is_tamil_nadu from a state string. null state → null (unknown). */
export function deriveIsTamilNadu(state: string | null): boolean | null {
  if (!state) return null;
  const s = state.trim().toLowerCase();
  if (s.length === 0) return null;
  if (s.includes("tamil nadu") || s.includes("tamilnadu") || s === "tn" || s.includes("தமிழ")) {
    return true;
  }
  return false;
}

// --- JSON extraction ---------------------------------------------------------

/**
 * Best-effort extraction of a JSON object from arbitrary model text:
 * tries a direct parse, then the first `{` … last `}` slice (handles code fences /
 * surrounding prose). Returns null if nothing parses.
 */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(raw.trim());
  if (direct) return direct;

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return tryParse(raw.slice(start, end + 1));
  }
  return null;
}

// --- public API --------------------------------------------------------------

/** Validate each field of an object into the Profile shape (is_tamil_nadu kept as given). */
function coerceFields(obj: Record<string, unknown>): Profile {
  return {
    age: boundedNumber(obj.age, 0, 120),
    gender: toEnum(obj.gender, genderSchema),
    marital_status: toEnum(obj.marital_status, maritalSchema),
    state: toState(obj.state),
    is_tamil_nadu: toBoolean(obj.is_tamil_nadu),
    disability_percent: boundedNumber(obj.disability_percent, 0, 100),
    is_family_head: toBoolean(obj.is_family_head),
    income_tax_payer: toBoolean(obj.income_tax_payer),
    govt_employee: toBoolean(obj.govt_employee),
    owns_four_wheeler: toBoolean(obj.owns_four_wheeler),
    monthly_income: boundedNumber(obj.monthly_income, 0, Number.MAX_SAFE_INTEGER),
    fixed_assets_value: boundedNumber(obj.fixed_assets_value, 0, Number.MAX_SAFE_INTEGER),
    has_regular_income: toBoolean(obj.has_regular_income),
    annual_family_income: boundedNumber(obj.annual_family_income, 0, Number.MAX_SAFE_INTEGER),
    land_acres_wet: boundedNumber(obj.land_acres_wet, 0, Number.MAX_SAFE_INTEGER),
    land_acres_dry: boundedNumber(obj.land_acres_dry, 0, Number.MAX_SAFE_INTEGER),
    annual_electricity_units: boundedNumber(obj.annual_electricity_units, 0, Number.MAX_SAFE_INTEGER),
    professional_tax_payer: toBoolean(obj.professional_tax_payer),
    is_pensioner: toBoolean(obj.is_pensioner),
    psu_or_bank_employee: toBoolean(obj.psu_or_bank_employee),
    elected_representative: toBoolean(obj.elected_representative),
    is_bpl: toBoolean(obj.is_bpl),
  };
}

/**
 * Parse raw model output into a validated Profile. Never throws; on any parse failure
 * returns EMPTY_PROFILE. Per-field invalid values become null. `is_tamil_nadu` is DERIVED
 * from `state` (never trusted from the model).
 */
export function parseProfile(raw: string): Profile {
  const obj = extractJsonObject(raw ?? "");
  if (!obj) return { ...EMPTY_PROFILE };
  const p = coerceFields(obj);
  return { ...p, is_tamil_nadu: deriveIsTamilNadu(p.state) };
}

/**
 * Validate an arbitrary object (e.g. an operator-edited profile from the web client) into
 * a safe Profile. Never throws. Unlike parseProfile, residency is NOT re-derived — the
 * operator may set `is_tamil_nadu` directly, and that edit is authoritative.
 */
export function sanitizeProfile(input: unknown): Profile {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ...EMPTY_PROFILE };
  return coerceFields(input as Record<string, unknown>);
}
