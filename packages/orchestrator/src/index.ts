/**
 * @urimai/orchestrator — the channel-agnostic conversation brain (Phase 3).
 *
 * Channels normalize their input (WhatsApp voice, web text, IVR) into (sessionId, text)
 * and render the normalized TurnResult. Nothing channel-specific lives below this line.
 */
export {
  createOrchestrator,
  decideNext,
  evaluateProfile,
  mergeProfiles,
  type Assessment,
  type AuditEntry,
  type Orchestrator,
  type OrchestratorDeps,
  type SessionStore,
  type TurnResult,
} from "./orchestrator.js";
export { QUESTIONS, FIELD_PRIORITY, type Question } from "./questions.js";
export { createDefaultOrchestrator, type DefaultOrchestratorOptions } from "./default.js";
