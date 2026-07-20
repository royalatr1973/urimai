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
    ta: "இந்தக் கடிதத்தின் நகல் வேறு யாருக்காவது போக வேண்டுமா? வேண்டாம் என்றால் 'வேண்டாம்' என்று சொல்லுங்கள்.",
    en: "Should a copy of this letter go to anyone else? Say 'no' if not.",
  },
};

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
