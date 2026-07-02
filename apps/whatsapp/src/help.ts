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
