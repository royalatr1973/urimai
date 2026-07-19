/**
 * @urimai/escalation — the "help → human" safety net shared by every channel: help/reset
 * detection and the escalation queue contract. Extracted from apps/whatsapp so the Madal
 * letters flow escalates through the exact same door (LETTERS_BRIEF.md §2.6, §3).
 */
export { RedisEscalationQueue, type EscalationQueue, type EscalationTicket } from "./escalation.js";
export { isHelpRequest, isResetRequest } from "./help.js";
