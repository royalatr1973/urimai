/**
 * "help" always routes to a human (PROJECT_BRIEF.md §2.6 / Human safety net). Detect it in
 * Tamil or English, generously — a confused or distressed user must always reach a person.
 */
const HELP_PATTERNS = [
  "help",
  "உதவி", // udhavi — help
  "உதவ",
  "ஆள்", // a person
  "மனித", // human
  "operator",
  "call me",
];

export function isHelpRequest(text: string): boolean {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return false;
  return HELP_PATTERNS.some((p) => t.includes(p));
}

/**
 * "New person" — clears the session profile. Critical on shared phones: one WhatsApp
 * number often serves many beneficiaries (a son, an SHG leader, a CSC operator), and two
 * people's facts must never merge into one profile. Patterns are deliberately distinctive
 * ("new" alone is too common in ordinary sentences to trigger a reset).
 */
const RESET_PATTERNS = [
  "புதிது", // pudhidhu — (something) new / afresh
  "புதுசு", // pudhusu — colloquial "new"
  "புது நபர்", // new person
  "வேறு ஆள்", // a different person
  "மறுதொடக்கம்", // restart
  "new person",
  "next person",
  "start over",
  "start again",
  "reset",
];

export function isResetRequest(text: string): boolean {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return false;
  return RESET_PATTERNS.some((p) => t.includes(p));
}
