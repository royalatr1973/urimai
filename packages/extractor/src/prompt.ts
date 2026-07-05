/**
 * The profile-extraction prompt.
 *
 * The LLM's ONLY job is to turn free Tamil/English speech into a structured Profile.
 * It understands; it never decides eligibility. The hard rule is NULL OVER GUESS:
 * if a field is not clearly stated or clearly implied, it stays null. A wrong value
 * here manufactures a confident wrong verdict downstream — the one outcome the whole
 * architecture exists to prevent.
 *
 * The `is_tamil_nadu` field is intentionally NOT requested from the model — it is
 * derived deterministically from `state` in code (see schema.ts).
 */

export const SYSTEM_PROMPT = `You extract a structured profile from a person's own words (Tamil or English) describing their situation, so a separate deterministic rules engine can check Tamil Nadu welfare eligibility.

You ONLY understand and structure information. You NEVER decide eligibility, and you NEVER guess.

# THE GOLDEN RULE: null over guess
Output a value ONLY when it is clearly stated or unambiguously implied by the person's words. If something is not mentioned, unclear, hedged, or you are unsure — output null for that field. Never infer beyond what was said. A wrong value causes a wrong welfare verdict; null is always safe because the system will simply ask a follow-up question.

# OUTPUT
Return ONLY a single JSON object — no prose, no markdown, no code fences. Use exactly these keys, every key present, null when unknown:

{
  "age": number | null,
  "gender": "male" | "female" | "other" | null,
  "marital_status": "married" | "widowed" | "unmarried" | "divorced" | null,
  "state": string | null,
  "disability_percent": number | null,
  "is_family_head": boolean | null,
  "income_tax_payer": boolean | null,
  "govt_employee": boolean | null,
  "owns_four_wheeler": boolean | null,
  "monthly_income": number | null,
  "fixed_assets_value": number | null,
  "has_regular_income": boolean | null,
  "annual_family_income": number | null,
  "land_acres_wet": number | null,
  "land_acres_dry": number | null,
  "annual_electricity_units": number | null,
  "professional_tax_payer": boolean | null,
  "is_pensioner": boolean | null,
  "psu_or_bank_employee": boolean | null,
  "elected_representative": boolean | null
}

# FIELD RULES
- age: years, only if a number/age is stated.
- gender: transgender / திருநங்கை / "other" → "other".
- marital_status: widow / விதவை → "widowed"; unmarried / திருமணம் ஆகவில்லை → "unmarried".
- state: the Indian state. If the person names a Tamil Nadu district or city (e.g. Madurai, Salem, சேலம், கோயம்புத்தூர்), set state to "Tamil Nadu". Do NOT try to set residency yourself — the system derives it from state.
- disability_percent: 0-100. A percentage or clear degree of disability → that number. A clear statement of NO disability ("I have no disability", "எனக்கு மாற்றுத்திறன் இல்லை", "not disabled") → 0. Vague symptoms without a level ("I can't walk", "eyesight is bad") → null.
- monthly_income: the INDIVIDUAL's own monthly income in rupees, only if a personal monthly figure is stated.
- annual_family_income: the WHOLE HOUSEHOLD's yearly income in rupees. Populate ONLY when a family-level or annual figure is actually stated. NEVER multiply an individual's monthly income by 12 to fill this — different scope, different number.
- has_regular_income: true ONLY for a clearly steady source (salary, pension, a regular job). false ONLY when income is clearly absent (no work, no support). Daily-wage, casual, seasonal, irregular, or unclear work → null. (Destitution is ultimately assessed by a field officer; do not pre-judge it.)
- fixed_assets_value: rupee value of fixed assets, only if stated.
- land_acres_wet / land_acres_dry: Tamil நஞ்சை = WET land (land_acres_wet); புஞ்சை = DRY land (land_acres_dry). English "wet land" / "dry land" likewise. Plain "land" / "நிலம்" with no wet/dry type stated → leave BOTH null; never assign land to one side without the type.
- is_family_head: true if the person says they head/run the family or are the head on the ration card.
- Boolean disqualifier flags (income_tax_payer, govt_employee, owns_four_wheeler, professional_tax_payer, is_pensioner, psu_or_bank_employee, elected_representative): true/false only when clearly stated; otherwise null.

# WORKED EXAMPLES (showing the subtle traps)
- "தினக்கூலி வேலை, சில நாள் இருக்கும் சில நாள் இல்ல" (daily-wage work, some days yes some days no) → has_regular_income: null  (NOT true — daily-wage/irregular work is not a steady source).
- "எனக்கு மாசம் 1200 ரூபா வருது" (I get ₹1200 a month) → monthly_income: 1200, annual_family_income: null  (an individual monthly figure is NOT a family annual figure; do not ×12).
- "அரை ஏக்கர் நஞ்சை நிலம்" (half acre of wet land) → land_acres_wet: 0.5, land_acres_dry: null.
- "எனக்கு வயசு 67, விதவை, மதுரையில் இருக்கேன்" → age: 67, marital_status: "widowed", gender: "female", state: "Tamil Nadu".
- "I have a government job" → govt_employee: true.

Remember: every key present, null when unknown, JSON object only.`;

/**
 * Human-readable descriptions of what each field means. Fed to the model as CONTEXT when
 * we just asked the user about that field — so a bare answer ("no", "50000", "half acre")
 * can be interpreted against the right target. Keeps the extractor prompt-agnostic about
 * which field is "pending" any given turn; the orchestrator supplies that.
 */
const FIELD_CONTEXT: Record<string, string> = {
  age: "the person's age in years",
  gender: 'the person\'s gender ("male", "female", or "other" for transgender)',
  marital_status: 'the person\'s marital status ("married", "widowed", "unmarried", or "divorced")',
  state: "the Indian state / district / city the person lives in",
  is_tamil_nadu: "whether the person lives in Tamil Nadu (a bare yes/no maps to true/false; a district or town name confirming Tamil Nadu should also set state)",
  disability_percent: 'the disability percentage on the person\'s certificate. A bare "no" / "இல்லை" / "not disabled" means 0. A number is the percentage.',
  is_family_head: "whether the person is the head of their family on the ration card",
  income_tax_payer: "whether anyone in the family pays income tax",
  govt_employee: "whether anyone in the family is a government employee",
  owns_four_wheeler: "whether the family owns a four-wheeler (car, jeep, tractor)",
  monthly_income: "the person's own monthly income in rupees",
  fixed_assets_value: "the rupee value of the person's fixed assets / property. A bare number is that value.",
  has_regular_income: 'whether the person has a steady regular income (salary, pension, regular job). A bare "no" means false; a bare "yes" means true. Irregular / daily-wage work stays null.',
  annual_family_income: "the family's total income for a year in rupees",
  land_acres_wet: "acres of wet land (நஞ்சை) the person owns. A bare number is acres.",
  land_acres_dry: "acres of dry land (புஞ்சை) the person owns. A bare number is acres.",
  annual_electricity_units: "annual household electricity usage in units",
  professional_tax_payer: "whether anyone in the family pays professional tax",
  is_pensioner: "whether anyone in the family receives a government pension",
  psu_or_bank_employee: "whether anyone in the family works for a PSU or a bank",
  elected_representative: "whether anyone in the family is an elected local-body representative",
};

/**
 * Wrap the user's situation text into the user-turn content. When `pendingField` is set,
 * we told the user we were asking about that field in the previous turn — bare answers
 * ("no", "50000", "half acre") should be interpreted against that field's meaning.
 */
export function buildUserPrompt(text: string, pendingField?: string | null): string {
  const context = pendingField && FIELD_CONTEXT[pendingField]
    ? `\n\nContext for this reply: in the previous turn, the system asked the user about "${pendingField}" — ${FIELD_CONTEXT[pendingField]}. If this reply is a bare answer (a lone number, "yes"/"no", "இல்லை"/"ஆம்"), interpret it as an answer to that specific field. If the reply also contains other information, extract that too (still following the field rules — never guess).`
    : "";
  return `Person's words:\n"""\n${text}\n"""${context}\n\nReturn the JSON profile object now.`;
}
