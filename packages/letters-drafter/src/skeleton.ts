/**
 * The deterministic letter skeleton (LETTERS_BRIEF §2.3): sender block, date, addressee,
 * subject, salutation, closing, signature/thumb-impression line — all rendered from the
 * LetterType record + collected facts, in code. The LLM never touches these. Legal
 * citations enter the letter HERE, from the LetterType's legalRefs, and nowhere else.
 */
import type { LetterFacts, LetterType } from "@urimai/types";

export type Language = "ta" | "en" | "bilingual";

/** A blank the citizen fills by hand — used when a fact was unknown (§2.2). */
export const BLANK = "________";

interface SkeletonStrings {
  salutation: string;
  closing: string;
  signaturePrefix: string; // "இப்படிக்கு," / "Yours faithfully,"
  signatureNote: string; // the signature / thumb-impression line
}

const SKELETON: Record<Language, SkeletonStrings> = {
  ta: {
    salutation: "ஐயா / அம்மையீர்,",
    closing: "நன்றி.",
    signaturePrefix: "இப்படிக்கு,",
    signatureNote: "(கையொப்பம் / இடது பெருவிரல் ரேகை)",
  },
  en: {
    salutation: "Sir / Madam,",
    closing: "Thank you.",
    signaturePrefix: "Yours faithfully,",
    signatureNote: "(Signature / left thumb impression)",
  },
  bilingual: {
    salutation: "ஐயா / அம்மையீர் (Sir / Madam),",
    closing: "நன்றி. (Thank you.)",
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

/** Addressee from facts; when the user knew nothing, the type's addresseeHint (§7.4). */
export function buildAddresseeBlock(type: LetterType, facts: LetterFacts): string {
  const lines = [facts.addressee_name, facts.addressee_office, facts.addressee_address].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  return lines.length > 0 ? lines.join("\n") : stripCuratorMarkers(type.addresseeHint) || BLANK;
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

/** dd-mm-yyyy, the common Tamil Nadu office format. */
export function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}
