/**
 * The hand-written golden LetterDraft (LETTERS_BRIEF Phase 1) — a civic grievance with
 * OBVIOUSLY sample facts ("க. மாதிரி" = "K. Sample"). Deliberately conjunct-rich
 * (ஸ்ரீ, க்ஷே, ட்டு, ன்று, ற்க) so mis-shaped Tamil is unmissable in the visual check.
 * Change it only alongside the golden files it generates.
 */
import type { LetterDraft } from "@urimai/types";

export const GOLDEN_DRAFT: LetterDraft = {
  letterTypeId: "civic_grievance",
  typeVersion: 1,
  senderBlock: "க. மாதிரி\nஎண் 12, ஸ்ரீநிவாசன் தெரு\nமயிலாப்பூர், சென்னை - 600004",
  date: "19-07-2026",
  addresseeBlock: "ஆணையர்,\nசென்னை மாநகராட்சி,\nரிப்பன் மாளிகை, சென்னை - 600003",
  subject: "எங்கள் தெருவில் தெருவிளக்குகள் இயங்காதது குறித்து புகார்",
  salutation: "ஐயா / அம்மையீர்,",
  bodyParagraphs: [
    "எங்கள் தெருவில் உள்ள ஐந்து தெருவிளக்குகள் கடந்த மூன்று வாரங்களாக இயங்கவில்லை. இதனால் இரவு நேரங்களில் முதியவர்களும் பள்ளி மாணவர்களும் நடமாட மிகுந்த சிரமப்படுகிறார்கள்.",
    "இது குறித்து 01-07-2026 அன்று வட்டார அலுவலகத்தில் வாய்மொழியாகத் தெரிவித்தும் இதுவரை நடவடிக்கை எடுக்கப்படவில்லை. பொதுமக்களின் க்ஷேமம் கருதி விரைந்து பழுது நீக்கித் தருமாறு கேட்டுக்கொள்கிறேன்.",
  ],
  closing: "நன்றி.",
  signatureLine: "இப்படிக்கு,\nக. மாதிரி\n(கையொப்பம் / இடது பெருவிரல் ரேகை)",
  copyTo: "வட்டார உறுப்பினர், 4-வது வார்டு",
  disclaimer:
    "இந்தக் கடிதம் செயற்கை நுண்ணறிவு (AI) உதவியுடன் உருவாக்கப்பட்டது. தவறுகள் இருக்கக்கூடும் — அனுப்பும் முன் விவரங்களைச் சரிபார்க்கவும்.",
  language: "ta",
};
