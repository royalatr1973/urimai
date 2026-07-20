/**
 * The deterministic letter skeleton (LETTERS_BRIEF §2.3): sender block, date, addressee,
 * subject, salutation, closing, signature/thumb-impression line — all rendered from the
 * LetterType record + collected facts, in code. The LLM never touches these. Legal
 * citations enter the letter HERE, from the LetterType's legalRefs, and nowhere else.
 */
import type { LetterFacts, LetterType, OfficeAddress } from "@urimai/types";

export type Language = "ta" | "en" | "bilingual";

/** A blank the citizen fills by hand — used when a fact was unknown (§2.2). */
export const BLANK = "________";

interface SkeletonStrings {
  salutation: string;
  closing: string;
  signaturePrefix: string; // "இப்படிக்கு," / "Yours faithfully,"
  signatureNote: string; // the signature / thumb-impression line
}

// NOTE: the AI disclaimer is deliberately NOT in the skeleton — it is spoken to the
// user by the channel, never printed on the letter (live-tester decision, July 2026).
const SKELETON: Record<Language, SkeletonStrings> = {
  ta: {
    salutation: "மதிப்பிற்குரிய ஐயா / அம்மையீர்,",
    closing: "தங்கள் கனிவான நடவடிக்கைக்கு என்றும் நன்றியுடன் இருப்பேன். நன்றி.",
    signaturePrefix: "இப்படிக்கு,",
    signatureNote: "(கையொப்பம் / இடது பெருவிரல் ரேகை)",
  },
  en: {
    salutation: "Respected Sir / Madam,",
    closing: "I shall remain grateful for your kind action. Thank you.",
    signaturePrefix: "Yours faithfully,",
    signatureNote: "(Signature / left thumb impression)",
  },
  bilingual: {
    salutation: "மதிப்பிற்குரிய ஐயா / அம்மையீர் (Respected Sir / Madam),",
    closing: "தங்கள் கனிவான நடவடிக்கைக்கு நன்றி. (Thank you for your kind action.)",
    signaturePrefix: "இப்படிக்கு (Yours faithfully),",
    signatureNote: "(கையொப்பம் / இடது பெருவிரல் ரேகை — Signature / left thumb impression)",
  },
};

/**
 * The seed data flags every unconfirmed addressee format with an "(UNVERIFIED …)"
 * marker for curators. That marker must never print on a citizen's letter.
 */
export function stripCuratorMarkers(s: string): string {
  return s.replace(/\s*\((UNVERIFIED|VERIFY)[^)]*\)/gi, "").trim();
}

export function buildSenderBlock(facts: LetterFacts): string {
  const lines = [facts.sender_name ?? BLANK];
  if (facts.sender_address) lines.push(facts.sender_address);
  if (facts.sender_phone) lines.push(facts.sender_phone);
  return lines.join("\n");
}

/** An office's full postal block: Tamil designation, address lines, pincode. */
export function officeAddressBlock(office: OfficeAddress): string {
  const lines = [office.designationTamil, ...office.addressLines];
  if (office.pincode) {
    const last = lines.length - 1;
    lines[last] = `${lines[last]} - ${office.pincode}`;
  }
  return lines.join("\n");
}

/** A single நகல் line for an office: designation, plus the address when usable. */
export function officeCcLine(office: OfficeAddress): string {
  const usable = office.addressLines.length > 0 && !office.addressLines.some((l) => l.toUpperCase().includes("ADDRESS_TO_VERIFY"));
  if (!usable) return office.designationTamil;
  const addr = office.addressLines.join(", ");
  return `${office.designationTamil}, ${addr}${office.pincode ? ` - ${office.pincode}` : ""}`;
}

/**
 * Addressee precedence (§7.4 + live-tester feedback): what the USER stated wins; else
 * the curator DIRECTORY office for this letter type; else the type's addresseeHint.
 */
export function buildAddresseeBlock(type: LetterType, facts: LetterFacts, toOffice?: OfficeAddress | null): string {
  const lines = [facts.addressee_name, facts.addressee_office, facts.addressee_address].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  if (lines.length > 0) return lines.join("\n");
  if (toOffice) return officeAddressBlock(toOffice);
  return stripCuratorMarkers(type.addresseeHint) || BLANK;
}

/**
 * Subject: the user's own subject if stated, else the letter type's name. Legal
 * citations are appended HERE, verbatim from the DB record — the ONLY place a citation
 * can enter a letter (§2.2, §9).
 */
export function buildSubject(type: LetterType, facts: LetterFacts, language: Language): string {
  const base = facts.subject ?? (language === "en" ? type.nameEnglish : type.nameTamil);
  const refs = type.legalRefs.map((r) => r.citation).filter((c) => c.trim().length > 0);
  return refs.length > 0 ? `${base} — ${refs.join("; ")}` : base;
}

export function buildSalutation(language: Language): string {
  return SKELETON[language].salutation;
}

export function buildClosing(language: Language): string {
  return SKELETON[language].closing;
}

export function buildSignatureLine(facts: LetterFacts, language: Language): string {
  const s = SKELETON[language];
  return [s.signaturePrefix, facts.sender_name ?? BLANK, s.signatureNote].join("\n");
}

/**
 * "நகல்:" recipients: whoever the USER named first, then curated directory CC
 * offices — curator data, not model invention. null when there is nobody.
 */
export function buildCopyTo(facts: LetterFacts, ccOffices: OfficeAddress[] = []): string | null {
  const lines = [
    ...(facts.copy_to ? [facts.copy_to] : []),
    ...ccOffices.map((o) => officeCcLine(o)),
  ];
  return lines.length > 0 ? lines.join("\n") : null;
}

/** dd-mm-yyyy, the common Tamil Nadu office format. */
export function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}
