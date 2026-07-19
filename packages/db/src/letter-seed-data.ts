/**
 * Canonical seed data for the Madal letter-type catalogue (LETTERS_BRIEF.md §1, §6).
 *
 * EVERY record ships `verified: false` — a human curator must review each template's
 * addressee format, required facts, and legal references before production, exactly like
 * scheme thresholds. NOTHING here is invented:
 *  - The only legal citation seeded is the RTI Act 2005 §6(1) reference named in
 *    LETTERS_BRIEF.md itself, and it is flagged for verification against the Act text.
 *  - All other `legalRefs` are EMPTY on purpose. Candidate references (e.g. BNSS
 *    provisions for police complaints, Payment of Wages Act sections) must be added by
 *    the curator, not guessed by code or model.
 *  - `addresseeHint` values are common-knowledge office descriptions, to be confirmed.
 *
 * `generic_petition` is the universal fallback — classification can never turn a user
 * away (LETTERS_BRIEF.md §1).
 */
import type { LetterType } from "@urimai/types";

const VERIFY = "UNVERIFIED — curator must confirm before production";

export const SEED_LETTER_TYPES: LetterType[] = [
  {
    id: "rti_request",
    nameTamil: "தகவல் அறியும் உரிமை விண்ணப்பம்",
    nameEnglish: "RTI request",
    addresseeHint:
      `Public Information Officer (PIO) of the office that holds the information. (${VERIFY})`,
    requiredFacts: ["sender_name", "sender_address", "addressee_office", "incident_details"],
    optionalFacts: ["sender_phone", "subject", "reference_ids", "prior_attempts", "amount", "attachments"],
    languageDefault: "ta",
    legalRefs: [
      {
        label: "Request for information under the RTI Act",
        citation: "Right to Information Act, 2005 — Section 6(1)",
        // Named in LETTERS_BRIEF.md §2.2 as the example citation; still needs human
        // verification against the Act text before any letter cites it.
        source: `LETTERS_BRIEF.md example (${VERIFY})`,
      },
    ],
    bodyGuidance:
      "State plainly WHAT information is sought, for what period, and in what form (copies/inspection). " +
      "One numbered question per item. Mention the ₹10 application fee mode only if the user states it. " +
      "RTI to central bodies may need English — offer the language choice.",
    version: 1,
    verified: false,
  },
  {
    id: "police_complaint",
    nameTamil: "காவல் நிலையப் புகார்",
    nameEnglish: "Police complaint",
    addresseeHint:
      `Station House Officer (SHO) of the police station covering the place of the incident. (${VERIFY})`,
    requiredFacts: ["sender_name", "sender_address", "incident_date", "incident_place", "incident_details"],
    optionalFacts: [
      "sender_phone",
      "addressee_office",
      "subject",
      "relief_sought",
      "prior_attempts",
      "reference_ids",
      "attachments",
    ],
    languageDefault: "ta",
    legalRefs: [], // curator to add (e.g. BNSS FIR provisions) — never guessed
    bodyGuidance:
      "Chronological, factual narration: what happened, when, where, who was involved, witnesses if named. " +
      "No legal conclusions or section numbers from the drafter. Close by requesting registration of the " +
      "complaint and an acknowledgement copy.",
    version: 1,
    verified: false,
  },
  {
    id: "civic_grievance",
    nameTamil: "நகராட்சி / ஊராட்சி குறை மனு",
    nameEnglish: "Municipal / civic grievance",
    addresseeHint:
      `Commissioner (municipality/corporation) or Executive Officer / BDO (town or village panchayat) of the local body. (${VERIFY})`,
    requiredFacts: ["sender_name", "sender_address", "incident_place", "incident_details"],
    optionalFacts: [
      "sender_phone",
      "subject",
      "incident_date",
      "prior_attempts",
      "relief_sought",
      "reference_ids",
      "attachments",
    ],
    languageDefault: "ta",
    legalRefs: [],
    bodyGuidance:
      "Describe the civic problem (street light, water, drainage, garbage, road), exactly where it is, how long " +
      "it has persisted, and how it affects residents. Ask for specific action within a reasonable time.",
    version: 1,
    verified: false,
  },
  {
    id: "scheme_grievance",
    nameTamil: "ஓய்வூதியம் / நலத்திட்ட குறை மனு",
    nameEnglish: "Pension / welfare-scheme grievance",
    addresseeHint:
      `Tahsildar of the taluk office where the scheme application was made (social security pensions), or the concerned department office. (${VERIFY})`,
    requiredFacts: ["sender_name", "sender_address", "incident_details"],
    optionalFacts: [
      "sender_phone",
      "subject",
      "reference_ids",
      "incident_date",
      "prior_attempts",
      "amount",
      "relief_sought",
      "attachments",
    ],
    languageDefault: "ta",
    legalRefs: [],
    bodyGuidance:
      "Name the scheme, when and where the person applied (application/acknowledgement number if known), what " +
      "went wrong (no response, stopped payment, wrong rejection), and what is requested. Reference prior visits " +
      "or complaints if the user mentions them.",
    version: 1,
    verified: false,
  },
  {
    id: "wage_complaint",
    nameTamil: "ஊதியம் / சம்பளப் புகார்",
    nameEnglish: "Wage complaint",
    addresseeHint: `Labour Officer / Assistant Commissioner of Labour of the district where the work was done. (${VERIFY})`,
    requiredFacts: ["sender_name", "sender_address", "incident_details", "amount"],
    optionalFacts: [
      "sender_phone",
      "subject",
      "addressee_office",
      "incident_date",
      "incident_place",
      "prior_attempts",
      "reference_ids",
      "relief_sought",
      "attachments",
    ],
    languageDefault: "ta",
    legalRefs: [], // curator to add (e.g. Payment of Wages Act) — never guessed
    bodyGuidance:
      "State the employer's name and place of work, the period worked, the agreed wage, the amount unpaid, and " +
      "any demand already made. Ask for recovery of the stated amount only — never compute or invent figures.",
    version: 1,
    verified: false,
  },
  {
    id: "transfer_leave_application",
    nameTamil: "மாறுதல் / விடுப்பு விண்ணப்பம்",
    nameEnglish: "Transfer / leave application",
    addresseeHint: `Head of the applicant's institution or office (headmaster, manager, department head). (${VERIFY})`,
    requiredFacts: ["sender_name", "addressee_office", "subject", "incident_details"],
    optionalFacts: ["sender_address", "sender_phone", "incident_date", "reference_ids", "attachments"],
    languageDefault: "ta",
    legalRefs: [],
    bodyGuidance:
      "Formal and brief: the request (transfer to where / leave for which dates), the reason exactly as the user " +
      "gave it, and any employee/roll identifiers the user provides.",
    version: 1,
    verified: false,
  },
  {
    id: "generic_petition",
    nameTamil: "பொது மனு",
    nameEnglish: "General petition",
    addresseeHint:
      `The officer concerned — commonly the Tahsildar or the District Collector's petition (grievance day) cell when no specific office is known. (${VERIFY})`,
    requiredFacts: ["sender_name", "incident_details"],
    optionalFacts: [
      "sender_address",
      "sender_phone",
      "addressee_name",
      "addressee_office",
      "addressee_address",
      "subject",
      "incident_date",
      "incident_place",
      "prior_attempts",
      "amount",
      "reference_ids",
      "relief_sought",
      "attachments",
    ],
    languageDefault: "ta",
    legalRefs: [],
    bodyGuidance:
      "The universal fallback — no user is ever turned away. Respectful petition format: who the person is, " +
      "their situation in their own words, and what they are asking for. Leave clearly marked blanks for " +
      "anything essential the user could not provide.",
    version: 1,
    verified: false,
  },
];
