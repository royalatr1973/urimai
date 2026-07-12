/**
 * Gap questions — one per Profile field, Tamil-first.
 *
 * The orchestrator only ever asks about a field the engine reported as missing for an
 * in-scope scheme, so every entry here is a question that can actually change a verdict.
 * `is_tamil_nadu` is derived from `state`, so its "question" asks about location and the
 * extractor fills `state` (then residency is derived).
 */
import type { Profile } from "@urimai/types";

export interface Question {
  en: string;
  ta: string;
  /**
   * Optional Tamil lead-in for DELICATE questions (money, assets, land, BPL, disability):
   * states WHY the question is asked before asking it, so the citizen isn't cold-asked
   * about her family's earnings by a stranger. Curator-reviewable data, like the question
   * itself. Boundary: the purpose names what the scheme is FOR ("for low-income families"),
   * never the numeric threshold — thresholds in the prompt invite gamed answers.
   */
  purposeTa?: string;
}

export const QUESTIONS: Record<keyof Profile, Question> = {
  age: { en: "How old are you?", ta: "உங்கள் வயதை தயவுசெய்து சொல்லுங்களேன்?" },
  gender: { en: "Are you a man, a woman, or transgender?", ta: "நீங்கள் ஆணா, பெண்ணா, அல்லது திருநங்கையா என்று சொல்ல முடியுமா?" },
  marital_status: { en: "Are you married, widowed, unmarried, or divorced?", ta: "நீங்கள் திருமணமானவரா, விதவையா, திருமணமாகாதவரா, அல்லது விவாகரத்து ஆனவரா என்று தயவுசெய்து சொல்லுங்கள்." },
  state: { en: "Which state and district do you live in?", ta: "நீங்கள் எந்த மாநிலம், எந்த மாவட்டத்தில் வசிக்கிறீர்கள் என்று சொல்லுங்களேன்?" },
  is_tamil_nadu: { en: "Which district or town in Tamil Nadu do you live in?", ta: "தமிழ்நாட்டில் எந்த ஊர் அல்லது மாவட்டத்தில் வசிக்கிறீர்கள் என்று சொல்ல முடியுமா?" },
  disability_percent: {
    en: "Do you have a disability? If so, what percentage is on your certificate?",
    ta: "உங்களுக்கு மாற்றுத்திறன் உள்ளதா? இருந்தால், சான்றிதழில் எத்தனை சதவீதம் என்று தயவுசெய்து சொல்லுங்கள்.",
    purposeTa: "மாற்றுத்திறனாளிகளுக்கு தனி ஓய்வூதியத் திட்டம் உள்ளது — அதைச் சரிபார்க்கவே கேட்கிறேன்.",
  },
  is_family_head: { en: "Are you the head of your family on the ration card?", ta: "குடும்ப அட்டையில் நீங்கள்தான் குடும்பத் தலைவரா, சொல்ல முடியுமா?" },
  income_tax_payer: { en: "Does anyone in your family pay income tax?", ta: "உங்கள் குடும்பத்தில் யாராவது வருமான வரி கட்டுகிறார்களா என்று சொல்லுங்களேன்?" },
  govt_employee: { en: "Is anyone in your family a government employee?", ta: "உங்கள் குடும்பத்தில் யாராவது அரசு பணியில் இருக்கிறார்களா, சொல்ல முடியுமா?" },
  owns_four_wheeler: { en: "Does your family own a four-wheeler — a car, jeep, or tractor?", ta: "உங்கள் குடும்பத்திற்கு கார், ஜீப் அல்லது டிராக்டர் போன்ற நான்கு சக்கர வாகனம் இருக்கிறதா என்று சொல்லுங்களேன்?" },
  monthly_income: {
    en: "Roughly how much do you earn each month?",
    ta: "மாதம் சுமார் எவ்வளவு வருமானம் என்று தயவுசெய்து சொல்ல முடியுமா?",
    purposeTa: "தகுதியை சரிபார்க்க மட்டுமே இந்த தகவல் — பாதுகாப்பாக இருக்கும்.",
  },
  fixed_assets_value: {
    en: "Roughly what is the value of property or assets you own?",
    ta: "உங்களிடம் உள்ள சொத்தின் மதிப்பு சுமார் எவ்வளவு என்று தயவுசெய்து சொல்லுங்கள்.",
    purposeTa: "சில திட்டங்களின் அரசு விதிகளில் சொத்து அளவு உள்ளது — அதனால் கேட்கிறேன். இந்த தகவல் பாதுகாப்பாக இருக்கும்.",
  },
  has_regular_income: {
    en: "Do you have a steady, regular income such as a salary or pension?",
    ta: "உங்களுக்கு சம்பளம் அல்லது ஓய்வூதியம் போன்ற நிலையான வருமானம் இருக்கிறதா, சொல்ல முடியுமா?",
    purposeTa: "இந்த ஓய்வூதியத் திட்டங்கள் நிலையான வருமானம் இல்லாதவர்களுக்காக உருவாக்கப்பட்டவை — அதனால் கேட்கிறேன்.",
  },
  annual_family_income: {
    en: "Roughly what is your family's total income for a year?",
    ta: "உங்கள் குடும்பத்தின் ஆண்டு மொத்த வருமானம் சுமார் எவ்வளவு என்று தயவுசெய்து சொல்லுங்கள்.",
    purposeTa: "சில திட்டங்கள் குறைந்த வருமானக் குடும்பங்களுக்கு மட்டுமே — அதனால் கேட்கிறேன். இந்த தகவல் பாதுகாப்பாக இருக்கும்.",
  },
  land_acres_wet: {
    en: "Do you own any wet land (நஞ்சை)? How many acres?",
    ta: "உங்களிடம் நஞ்சை நிலம் இருக்கிறதா? இருந்தால் எத்தனை ஏக்கர் என்று சொல்லுங்களேன்?",
    purposeTa: "மகளிர் உரிமைத் தொகை விதிகளில் நில அளவு உள்ளது — அதனால் கேட்கிறேன்.",
  },
  land_acres_dry: {
    en: "Do you own any dry land (புஞ்சை)? How many acres?",
    ta: "உங்களிடம் புஞ்சை நிலம் இருக்கிறதா? இருந்தால் எத்தனை ஏக்கர் என்று சொல்லுங்களேன்?",
  },
  annual_electricity_units: { en: "Roughly how many units of electricity does your home use in a year?", ta: "உங்கள் வீட்டில் ஒரு வருடத்திற்கு சுமார் எத்தனை யூனிட் மின்சாரம் ஆகிறது என்று சொல்ல முடியுமா?" },
  professional_tax_payer: { en: "Does anyone in your family pay professional tax?", ta: "உங்கள் குடும்பத்தில் யாராவது தொழில் வரி கட்டுகிறார்களா என்று சொல்லுங்களேன்?" },
  is_pensioner: { en: "Does anyone in your family receive a government pension?", ta: "உங்கள் குடும்பத்தில் யாராவது அரசு ஓய்வூதியம் பெறுகிறார்களா, சொல்ல முடியுமா?" },
  psu_or_bank_employee: { en: "Is anyone in your family employed by a PSU or a bank?", ta: "உங்கள் குடும்பத்தில் யாராவது பொதுத்துறை நிறுவனத்திலோ வங்கியிலோ வேலை செய்கிறார்களா என்று சொல்லுங்களேன்?" },
  elected_representative: { en: "Is anyone in your family an elected local-body representative?", ta: "உங்கள் குடும்பத்தில் யாராவது தேர்ந்தெடுக்கப்பட்ட உள்ளாட்சி பிரதிநிதியாக இருக்கிறார்களா, சொல்ல முடியுமா?" },
  is_bpl: {
    en: "Do you have a BPL (Below Poverty Line) card?",
    ta: "உங்களிடம் வறுமைக் கோட்டுக்கு கீழ் உள்ள (BPL) அட்டை இருக்கிறதா, தயவுசெய்து சொல்லுங்கள்.",
    purposeTa: "சில திட்டங்கள் வறுமைக் கோட்டுக்கு கீழ் உள்ள குடும்பங்களுக்கு மட்டுமே — அதனால் கேட்கிறேன்.",
  },
};

/**
 * Tie-break order when several missing fields would unblock the same number of schemes.
 * Broad, gating facts first (residency, age), then the discriminating ones, then the
 * many KMUT-specific disqualifiers. `monthly_income` is informational (no scheme rule
 * references it) so it is never asked.
 */
export const FIELD_PRIORITY: (keyof Profile)[] = [
  "age", // curator decision: age is the conversation opener — easy, universal, unblocking
  "is_tamil_nadu",
  "gender",
  "marital_status",
  "has_regular_income",
  "is_bpl",
  "fixed_assets_value",
  "disability_percent",
  "is_family_head",
  "annual_family_income",
  "land_acres_wet",
  "land_acres_dry",
  "annual_electricity_units",
  "owns_four_wheeler",
  "income_tax_payer",
  "professional_tax_payer",
  "govt_employee",
  "psu_or_bank_employee",
  "is_pensioner",
  "elected_representative",
];
