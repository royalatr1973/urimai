/**
 * Gap questions — one per FactKey, Tamil-first, curator-reviewable data like the Urimai
 * question set. The gap loop asks ONE at a time, only for facts the letter type
 * requires and the user hasn't given (LETTERS_BRIEF §7.4).
 */
import type { FactKey } from "@urimai/types";

export interface LetterQuestion {
  ta: string;
  en: string;
}

export const QUESTIONS: Record<FactKey, LetterQuestion> = {
  sender_name: {
    ta: "கடிதத்தில் போட உங்கள் முழுப் பெயரை சொல்லுங்கள்.",
    en: "What is your full name, for the letter?",
  },
  sender_address: {
    ta: "உங்கள் முகவரியை சொல்லுங்கள் — ஊர், தெரு.",
    en: "What is your address — town and street?",
  },
  sender_phone: {
    ta: "தொடர்பு கொள்ள உங்கள் போன் எண் என்ன?",
    en: "What is your phone number?",
  },
  addressee_name: {
    ta: "இந்தக் கடிதம் யாருக்கு போகணும் — பெயர் தெரிந்தால் சொல்லுங்கள்; தெரியாவிட்டால் 'தெரியலை' என்று சொல்லுங்கள்.",
    en: "Who should this letter go to, by name? Say 'I don't know' if unsure.",
  },
  addressee_office: {
    ta: "எந்த அலுவலகத்துக்கு அனுப்பணும்? தெரியாவிட்டால் 'தெரியலை' என்று சொல்லுங்கள் — நாங்களே சரியான அலுவலகத்தை போட்டு விடுகிறோம்.",
    en: "Which office should it go to? Say 'I don't know' and we'll use the usual office.",
  },
  addressee_address: {
    ta: "அந்த அலுவலகத்தின் முகவரி தெரியுமா? தெரியாவிட்டால் 'தெரியலை' என்று சொல்லுங்கள்.",
    en: "Do you know that office's address? Say 'I don't know' if not.",
  },
  subject: {
    ta: "கடிதத்தின் தலைப்பு என்னவாக இருக்க வேண்டும்?",
    en: "What should the subject line be?",
  },
  incident_date: {
    ta: "இது எப்போது நடந்தது?",
    en: "When did this happen?",
  },
  incident_place: {
    ta: "இது எங்கே நடந்தது?",
    en: "Where did this happen?",
  },
  incident_details: {
    ta: "என்ன நடந்தது, உங்களுக்கு என்ன வேண்டும் — உங்கள் வார்த்தைகளிலேயே சொல்லுங்கள்.",
    en: "Tell me what happened and what you need, in your own words.",
  },
  prior_attempts: {
    ta: "இதற்கு முன்பு யாரிடமாவது புகார் செய்தீர்களா அல்லது முயற்சி செய்தீர்களா?",
    en: "Have you complained or tried anywhere before about this?",
  },
  amount: {
    ta: "எவ்வளவு தொகை சம்பந்தப்பட்டது?",
    en: "How much money is involved?",
  },
  reference_ids: {
    ta: "விண்ணப்ப எண், FIR எண் போன்ற ஏதாவது எண் இருக்கிறதா?",
    en: "Do you have any reference number — application number, FIR number?",
  },
  relief_sought: {
    ta: "என்ன நடக்க வேண்டும் என்று எதிர்பார்க்கிறீர்கள்?",
    en: "What would you like to be done?",
  },
  attachments: {
    ta: "கடிதத்துடன் இணைக்க ஏதாவது ஆவணங்கள் இருக்கிறதா?",
    en: "Do you have any documents to attach?",
  },
  copy_to: {
    ta: "இந்தக் கடிதத்தின் நகல் (Copy) வேறு யாருக்காவது அனுப்ப வேண்டுமா? யாருக்கென்று சொல்லுங்கள். நகல் வேண்டாம் என்றால் 'வேண்டாம்' என்று சொல்லுங்கள்; யாருக்கு அனுப்பலாம் என்று தெரியாவிட்டால் 'தெரியலை' என்று சொல்லுங்கள் — நாங்களே பொருத்தமான அலுவலகத்தைத் தேடிப் போடுகிறோம்.",
    en: "Should a copy (நகல்) of this letter go to anyone? Name them; say 'no' for no copy, or 'I don't know' and we'll find the right office.",
  },
};

/**
 * Curated Tamil questions for the most common grievance-entity keys (controlled
 * vocabulary from data/grievance_categories.csv). Unmapped keys get the mechanical
 * fallback below — curator can promote them here over time.
 */
const ENTITY_QUESTIONS: Record<string, LetterQuestion> = {
  village: { ta: "எந்த கிராமம் / ஊர்? தெரியாவிட்டால் 'தெரியலை' சொல்லுங்கள்.", en: "Which village/town?" },
  taluk: { ta: "எந்த வட்டம் (தாலுகா)? தெரியாவிட்டால் 'தெரியலை' சொல்லுங்கள்.", en: "Which taluk?" },
  district: { ta: "எந்த மாவட்டம்?", en: "Which district?" },
  street_name: { ta: "எந்த தெரு / பகுதி?", en: "Which street/area?" },
  ward_number: { ta: "வார்டு எண் தெரியுமா? தெரியாவிட்டால் 'தெரியலை' சொல்லுங்கள்.", en: "Ward number, if known?" },
  door_number: { ta: "கதவு எண் என்ன?", en: "Door number?" },
  survey_number: { ta: "சர்வே எண் தெரியுமா? தெரியாவிட்டால் 'தெரியலை' சொல்லுங்கள்.", en: "Survey number, if known?" },
  patta_number: { ta: "பட்டா எண் தெரியுமா? தெரியாவிட்டால் 'தெரியலை' சொல்லுங்கள்.", en: "Patta number, if known?" },
  extent: { ta: "நில அளவு எவ்வளவு (ஏக்கர்/சென்ட்)?", en: "Land extent (acres/cents)?" },
  document_number: { ta: "ஆவண (பத்திரம்) எண் தெரியுமா?", en: "Document number, if known?" },
  registration_year: { ta: "எந்த வருஷம் பதிவு செய்யப்பட்டது?", en: "Year of registration?" },
  sub_registrar_office: { ta: "எந்த சார்பதிவாளர் அலுவலகம்?", en: "Which sub-registrar office?" },
  application_number: { ta: "விண்ணப்ப எண் தெரியுமா? தெரியாவிட்டால் 'தெரியலை' சொல்லுங்கள்.", en: "Application number, if known?" },
  application_date: { ta: "எப்போது விண்ணப்பித்தீர்கள்?", en: "When did you apply?" },
  purpose: { ta: "எந்த தேவைக்காக (பள்ளி சேர்க்கை, வேலை, கடன் போன்று)?", en: "For what purpose?" },
  deceased_name: { ta: "இறந்தவரின் பெயர் என்ன?", en: "Name of the deceased?" },
  date_of_death: { ta: "இறந்த தேதி எப்போது?", en: "Date of death?" },
  relationship_to_deceased: { ta: "இறந்தவருக்கும் உங்களுக்கும் என்ன உறவு?", en: "Your relationship to the deceased?" },
  person_name: { ta: "யாருடைய பெயரில் சான்றிதழ் — அவர் பெயர் என்ன?", en: "Whose certificate — their name?" },
  event_date: { ta: "நிகழ்வு (பிறப்பு/இறப்பு) தேதி எப்போது?", en: "Date of the event?" },
  place_of_event: { ta: "எந்த இடத்தில் (ஊர்/மருத்துவமனை) நடந்தது?", en: "Place of the event?" },
  registration_number: { ta: "பதிவு எண் தெரியுமா?", en: "Registration number, if known?" },
  ration_card_number: { ta: "குடும்ப அட்டை எண் என்ன?", en: "Ration card number?" },
  member_name: { ta: "எந்த உறுப்பினர் — பெயர் என்ன?", en: "Which member — name?" },
  relationship: { ta: "உங்களுக்கு அவருக்கும் என்ன உறவு?", en: "Relationship?" },
  shop_number: { ta: "ரேஷன் கடை எண் தெரியுமா?", en: "Ration shop number, if known?" },
  consumer_number: { ta: "கன்சூமர் எண் (இணைப்பு எண்) என்ன?", en: "Consumer number?" },
  meter_number: { ta: "மீட்டர் எண் தெரியுமா?", en: "Meter number, if known?" },
  police_station: { ta: "எந்த காவல் நிலையம்?", en: "Which police station?" },
  fir_number: { ta: "FIR / CSR எண் இருந்தால் சொல்லுங்கள்; இல்லாவிட்டால் 'இல்லை'.", en: "FIR/CSR number if any?" },
  vehicle_number: { ta: "வாகன எண் என்ன?", en: "Vehicle number?" },
  bank_name: { ta: "எந்த வங்கி?", en: "Which bank?" },
  hospital_name: { ta: "எந்த மருத்துவமனை?", en: "Which hospital?" },
  patient_name: { ta: "நோயாளியின் பெயர் என்ன?", en: "Patient's name?" },
  visit_date: { ta: "எப்போது போனீர்கள்?", en: "When did you visit?" },
  school_name: { ta: "எந்த பள்ளி?", en: "Which school?" },
  student_name: { ta: "மாணவர் / மாணவியின் பெயர் என்ன?", en: "Student's name?" },
  class_standard: { ta: "எந்த வகுப்பு?", en: "Which class?" },
  institution_name: { ta: "எந்த கல்வி நிறுவனம் / கல்லூரி?", en: "Which institution?" },
  employer_name: { ta: "வேலை கொடுத்தவர் / நிறுவனத்தின் பெயர் என்ன?", en: "Employer's name?" },
  work_place: { ta: "எங்கே வேலை செய்தீர்கள்?", en: "Place of work?" },
  work_period: { ta: "எந்த காலம் வேலை செய்தீர்கள்?", en: "Period of work?" },
  shop_name: { ta: "எந்த கடை / நிறுவனம்?", en: "Which shop?" },
  product_name: { ta: "என்ன பொருள்?", en: "Which product?" },
  purchase_date: { ta: "எப்போது வாங்கினீர்கள்?", en: "When purchased?" },
  bill_number: { ta: "பில் எண் இருந்தால் சொல்லுங்கள்.", en: "Bill number if any?" },
  epic_number: { ta: "வாக்காளர் அடையாள (EPIC) எண் என்ன?", en: "EPIC number?" },
  enrolment_number: { ta: "பதிவு (enrolment) எண் தெரியுமா?", en: "Enrolment number, if known?" },
  case_number: { ta: "வழக்கு எண் என்ன?", en: "Case number?" },
  court_name: { ta: "எந்த நீதிமன்றம்?", en: "Which court?" },
  temple_name: { ta: "எந்த கோவில்?", en: "Which temple?" },
  waterbody_name: { ta: "எந்த ஏரி / குளம் / கால்வாய்?", en: "Which waterbody?" },
  crop_name: { ta: "என்ன பயிர்?", en: "Which crop?" },
  season: { ta: "எந்த பருவம் (சம்பா/குறுவை போன்று)?", en: "Which season?" },
  office_name: { ta: "எந்த அலுவலகம்?", en: "Which office?" },
  department_name: { ta: "எந்த துறை?", en: "Which department?" },
  establishment_name: { ta: "நிறுவனத்தின் பெயர் என்ன?", en: "Name of the establishment?" },
  group_name: { ta: "குழுவின் பெயர் என்ன?", en: "Group name?" },
  society_name: { ta: "சங்கத்தின் பெயர் என்ன?", en: "Society name?" },
  scheme_name: { ta: "எந்த திட்டம்?", en: "Which scheme?" },
  encroacher_details: { ta: "ஆக்கிரமிப்பு செய்தவர் யார் (தெரிந்தால்)?", en: "Who encroached, if known?" },
  udid_number: { ta: "மாற்றுத்திறன் அடையாள (UDID) எண் தெரியுமா?", en: "UDID number, if known?" },
};

/** Question for a grievance entity: curated when known, mechanical fallback otherwise. */
export function entityQuestion(entity: string): LetterQuestion {
  const curated = ENTITY_QUESTIONS[entity];
  if (curated) return curated;
  const label = entity.replace(/_/g, " ");
  return {
    ta: `"${label}" விவரத்தைச் சொல்லுங்கள். தெரியாவிட்டால் 'தெரியலை' என்று சொல்லுங்கள்.`,
    en: `Please tell me the ${label}. Say 'I don't know' if unsure.`,
  };
}

/** The listen prompt — §7.2, spoken after the user picks "letter" at the greeting. */
export const LISTEN_PROMPT: LetterQuestion = {
  ta: "என்ன நடந்தது, உங்களுக்கு என்ன வேண்டும் — உங்கள் வார்த்தைகளிலேயே சொல்லுங்கள். நான் கேட்டுக்கொண்டு கடிதம் தயார் செய்கிறேன்.",
  en: "Tell me what happened and what you want, in your own words. I'll listen and prepare the letter.",
};

/** The read-back closing question — §7.6, with HOW to answer spelled out. */
export const READBACK_PROMPT: LetterQuestion = {
  ta: "கடிதம் சரியென்றால் 'சரி' என்று சொல்லுங்கள். ஏதாவது மாற்ற வேண்டுமானால், என்ன மாற்ற வேண்டும் என்று சொல்லுங்கள்.",
  en: "If the letter is okay, say 'okay'. If something should change, tell me what to change.",
};

/** After a changed-part re-read. */
export const CHANGED_INTRO: LetterQuestion = {
  ta: "மாற்றிய பகுதி இதோ:",
  en: "Here is the changed part:",
};

export const NO_CHANGE_NEEDED: LetterQuestion = {
  ta: "கடிதத்தில் அந்த விவரம் ஏற்கனவே அப்படியே உள்ளது — மாற்றம் தேவைப்படவில்லை.",
  en: "The letter already reads that way — no change was needed.",
};

/** A correction that only removed content (e.g. dropping the நகல் recipients). */
export const REMOVED_NOTE: LetterQuestion = {
  ta: "கேட்டபடி நீக்கிவிட்டேன்.",
  en: "Removed as you asked.",
};

/**
 * Spoken AI disclaimer — told to the USER at read-back and delivery, but never printed
 * on the letter itself (live-tester decision, July 2026).
 */
export const SPOKEN_DISCLAIMER: LetterQuestion = {
  ta: "ஒரு குறிப்பு: இந்தக் கடிதம் செயற்கை நுண்ணறிவு (AI) உதவியுடன் உருவாக்கப்பட்டது. தவறுகள் இருக்கக்கூடும் — அனுப்பும் முன் விவரங்களைச் சரிபார்த்துக் கொள்ளுங்கள்.",
  en: "A note: this letter was prepared with AI assistance. AI can make mistakes — please verify the details before submitting.",
};

/**
 * Spoken AFTER the PDF/Word documents are delivered — the user reviews the actual
 * letter and either confirms (close) or asks for a change (redo + re-deliver).
 */
export const DELIVERED_REVIEW_PROMPT: LetterQuestion = {
  ta: "கடிதத்தை (PDF) நன்றாகப் படித்துப் பாருங்கள். எல்லாம் சரியாக இருந்தால் 'சரி' அல்லது 'நன்றி' என்று சொல்லுங்கள் — கடிதம் முடிந்தது. ஏதாவது மாற்ற வேண்டுமானால், என்ன மாற்ற வேண்டும் என்று சொல்லுங்கள்; திருத்தி மீண்டும் அனுப்புகிறேன்.",
  en: "Please read the PDF carefully. If everything is correct, say 'okay' or 'thanks' — the letter is done. If anything should change, tell me what to change and I'll redo and resend it.",
};

/** Asked once the documents are accepted — one short feedback per letter. On WhatsApp
 *  this is rendered as a tappable 5-star list; the wording stays short to suit that. */
export const FEEDBACK_PROMPT: LetterQuestion = {
  ta: "கடிதம் தயார்! இந்தச் சேவை உங்களுக்கு எப்படி இருந்தது? உங்கள் மதிப்பீட்டைத் தேர்ந்தெடுங்கள்:",
  en: "Your letter is ready! How was this service for you? Please pick your rating:",
};

/** Warm close after feedback is captured. */
export const CLOSED_PROMPT: LetterQuestion = {
  ta: "உங்கள் கருத்துக்கு நன்றி! கடிதத்தைப் பிரிண்ட் எடுத்து, கையொப்பம் அல்லது இடது பெருவிரல் ரேகை வைத்து, சம்பந்தப்பட்ட அலுவலகத்தில் கொடுங்கள். வேறு கடிதம் வேண்டுமானால் 'கடிதம்' என்று சொல்லுங்கள். நன்றி!",
  en: "Thank you for your feedback! Print the letter, sign or add your left thumb impression, and submit it to the concerned office. Say 'letter' for another. Thank you!",
};

/** Unclear reply while awaiting post-delivery review. */
export const POST_DELIVERY_CLARIFY: LetterQuestion = {
  ta: "மன்னிக்கவும், சரியாகப் புரியவில்லை. கடிதம் சரியாக இருந்தால் 'சரி' என்று சொல்லுங்கள்; மாற்ற வேண்டுமானால் எதை மாற்ற வேண்டும் என்று சொல்லுங்கள்.",
  en: "Sorry, I didn't catch that. If the letter is fine, say 'okay'; if not, tell me what to change.",
};

/** When the review reply is neither a clear yes nor a stated change (§2.1 — never guess). */
export const CLARIFY_PROMPT: LetterQuestion = {
  ta: "மன்னிக்கவும், சரியாகப் புரியவில்லை. கடிதம் சரியென்றால் 'சரி' என்று மட்டும் சொல்லுங்கள்; மாற்ற வேண்டியிருந்தால், எதை எப்படி மாற்ற வேண்டும் என்று சொல்லுங்கள்.",
  en: "Sorry, I didn't quite catch that. If the letter is okay, just say 'okay'; if not, tell me what to change and how.",
};

/** Type confirmation — §7.3, plain words, no jargon. */
export function confirmTypePrompt(nameTamil: string, nameEnglish: string): LetterQuestion {
  return {
    ta: `நீங்கள் "${nameTamil}" எழுத விரும்புகிறீர்கள் — சரியா? சரி என்றால் 'ஆம்' சொல்லுங்கள்; இல்லையென்றால் 'இல்லை' சொல்லுங்கள்.`,
    en: `You want a "${nameEnglish}" — correct? Say yes or no.`,
  };
}
