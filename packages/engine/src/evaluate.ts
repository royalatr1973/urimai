/**
 * The rules engine — Urimai's spine.
 *
 * `evaluate(profile, scheme)` is a PURE function: no I/O, no DB reads, no LLM calls,
 * no clock, no randomness. Same inputs → same Verdict, always. Eligibility is decided
 * here by deterministic rules (data), NEVER by the LLM. (PROJECT_BRIEF.md §2.1, §7.)
 *
 * Decision semantics (precedence matters):
 *   1. Any exclusion TRUE  → not_eligible        (definitive — more info can't help)
 *   2. Any criterion FALSE → not_eligible        (definitive — value is known and fails)
 *   3. Else any field needed by a rule is unknown → need_info  (+ missingFields)
 *   4. Else all criteria pass and all exclusions clear → eligible
 *
 * Definitive disqualification (1, 2) takes precedence over need_info (3): if the person
 * is already ruled out by a known fact, we don't keep asking questions.
 *
 * The "any" operator (added July 2026 for KMUT's married-OR-head clause) evaluates a
 * group of field sub-rules and is TRUE if any sub-rule is TRUE, FALSE if all sub-rules
 * are FALSE, and UNKNOWN otherwise. Missing fields from all-not-yet-true sub-rules are
 * contributed to the top-level missingFields list.
 */
import type { AnyRule, FieldRule, Profile, Rule, Scheme, Verdict } from "@urimai/types";

/** Whether a rule's condition holds, given what we currently know. */
type RuleState = "true" | "false" | "unknown";

/** A field is "unknown" when the profile has no value for it yet. */
function isUnknown(value: Profile[keyof Profile]): boolean {
  return value === null || value === undefined;
}

/**
 * Evaluate a single-field rule's condition against the profile.
 * Returns "unknown" when the field is not yet known. Throws on a malformed rule
 * (e.g. a numeric comparison whose value isn't a number) — bad rule DATA should fail
 * loudly in curation/tests, never silently mis-decide a welfare verdict.
 */
function fieldRuleState(rule: FieldRule, profile: Profile): RuleState {
  const value = profile[rule.field];
  if (isUnknown(value)) return "unknown";

  switch (rule.op) {
    case "true":
      return value === true ? "true" : "false";
    case "false":
      return value === false ? "true" : "false";
    case "eq":
      return value === rule.value ? "true" : "false";
    case "in": {
      if (!Array.isArray(rule.value)) {
        throw new Error(
          `Malformed rule: op "in" on field "${String(rule.field)}" requires an array value ` +
            `(got ${JSON.stringify(rule.value)})`,
        );
      }
      return (rule.value as Array<string | number>).includes(value as string | number)
        ? "true"
        : "false";
    }
    case "gte":
    case "lte":
    case "gt":
    case "lt": {
      if (typeof value !== "number" || typeof rule.value !== "number") {
        throw new Error(
          `Malformed rule: op "${rule.op}" on field "${String(rule.field)}" requires ` +
            `numeric operands (got value=${JSON.stringify(value)}, rule.value=${JSON.stringify(rule.value)})`,
        );
      }
      switch (rule.op) {
        case "gte":
          return value >= rule.value ? "true" : "false";
        case "lte":
          return value <= rule.value ? "true" : "false";
        case "gt":
          return value > rule.value ? "true" : "false";
        case "lt":
          return value < rule.value ? "true" : "false";
      }
    }
    // exhaustiveness guard
    default: {
      const _never: never = rule.op;
      throw new Error(`Unknown rule op: ${String(_never)}`);
    }
  }
}

/**
 * Evaluate an "any"-of-criteria rule. TRUE if any sub-rule is TRUE (short-circuit),
 * FALSE if all sub-rules are FALSE, else UNKNOWN (still resolvable with more info).
 */
function anyRuleState(rule: AnyRule, profile: Profile): RuleState {
  if (rule.rules.length === 0) {
    throw new Error(`Malformed rule: op "any" requires at least one sub-rule (label: "${rule.label}")`);
  }
  let sawUnknown = false;
  for (const sub of rule.rules) {
    const s = fieldRuleState(sub, profile);
    if (s === "true") return "true";
    if (s === "unknown") sawUnknown = true;
  }
  return sawUnknown ? "unknown" : "false";
}

function ruleState(rule: Rule, profile: Profile): RuleState {
  return rule.op === "any" ? anyRuleState(rule, profile) : fieldRuleState(rule, profile);
}

/**
 * Fields that a rule DEPENDS ON — used to populate missingFields when the rule is unknown.
 * For an "any" rule, contribute only the fields of the sub-rules that are currently UNKNOWN.
 * A known-false sub-rule can never flip (its input is already known), so re-asking would be
 * a dead-end question; a known-true sub-rule already short-circuited us to TRUE.
 */
function dependencyFields(rule: Rule, profile: Profile): (keyof Profile)[] {
  if (rule.op !== "any") return [rule.field];
  const out: (keyof Profile)[] = [];
  for (const sub of rule.rules) {
    if (fieldRuleState(sub, profile) === "unknown") out.push(sub.field);
  }
  return out;
}

/**
 * Evaluate one profile against one scheme. Pure and deterministic.
 */
export function evaluate(profile: Profile, scheme: Scheme): Verdict {
  const triggeredExclusions: string[] = []; // exclusion conditions that are TRUE → disqualify
  const failedCriteria: string[] = []; // criteria that are FALSE → disqualify
  const passedCriteria: string[] = []; // criteria that are TRUE → reasons for eligibility
  const missingFields: (keyof Profile)[] = [];
  const missingLabels: string[] = [];
  const seenMissing = new Set<keyof Profile>();

  const noteMissing = (rule: Rule): void => {
    for (const field of dependencyFields(rule, profile)) {
      if (!seenMissing.has(field)) {
        seenMissing.add(field);
        missingFields.push(field);
      }
    }
    missingLabels.push(rule.label);
  };

  // ANY exclusion being true disqualifies.
  for (const rule of scheme.exclusions) {
    const state = ruleState(rule, profile);
    if (state === "true") triggeredExclusions.push(rule.label);
    else if (state === "unknown") noteMissing(rule);
    // "false" → exclusion clear, contributes nothing
  }

  // ALL criteria must pass.
  for (const rule of scheme.criteria) {
    const state = ruleState(rule, profile);
    if (state === "true") passedCriteria.push(rule.label);
    else if (state === "false") failedCriteria.push(rule.label);
    else noteMissing(rule);
  }

  const base = { schemeId: scheme.id, ruleVersion: scheme.version };

  // 1 & 2 — definitive disqualification beats need_info.
  if (triggeredExclusions.length > 0 || failedCriteria.length > 0) {
    return {
      ...base,
      status: "not_eligible",
      reasons: [...triggeredExclusions, ...failedCriteria],
      missingFields: [],
    };
  }

  // 3 — something a rule depends on is still unknown.
  if (missingFields.length > 0) {
    return {
      ...base,
      status: "need_info",
      reasons: missingLabels,
      missingFields,
    };
  }

  // 4 — everything known, all criteria pass, no exclusion triggered.
  return {
    ...base,
    status: "eligible",
    reasons: passedCriteria,
    missingFields: [],
  };
}
