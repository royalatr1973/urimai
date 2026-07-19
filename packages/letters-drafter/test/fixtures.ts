import type { LetterFacts, LetterType } from "@urimai/types";

export const POLICE_TYPE: LetterType = {
  id: "police_complaint",
  nameTamil: "காவல் நிலையப் புகார்",
  nameEnglish: "Police complaint",
  addresseeHint: "Station House Officer (SHO) of the police station covering the place of the incident. (UNVERIFIED — curator must confirm before production)",
  requiredFacts: ["sender_name", "sender_address", "incident_date", "incident_place", "incident_details"],
  optionalFacts: ["sender_phone", "addressee_office", "subject", "relief_sought", "prior_attempts", "reference_ids", "attachments"],
  languageDefault: "ta",
  legalRefs: [],
  bodyGuidance: "Chronological, factual narration.",
  version: 1,
  verified: false,
};

export const RTI_TYPE: LetterType = {
  ...POLICE_TYPE,
  id: "rti_request",
  nameTamil: "தகவல் அறியும் உரிமை விண்ணப்பம்",
  nameEnglish: "RTI request",
  legalRefs: [{ label: "RTI", citation: "Right to Information Act, 2005 — Section 6(1)", source: "brief" }],
};

export const FACTS: LetterFacts = {
  letterTypeId: "police_complaint",
  language: null,
  sender_name: "முருகன்",
  sender_address: "கடலூர் பழைய பஸ் ஸ்டாண்ட் பக்கம்",
  incident_date: "18-07-2026",
  incident_place: "எங்க வீடு",
  incident_details: "தங்க செயின் ரெண்டும் எட்டாயிரம் ரூபா பணமும் திருடு போச்சு",
  amount: "8000 ரூபா",
};
