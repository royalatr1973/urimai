/**
 * @urimai/letters-orchestrator — the channel-agnostic Madal conversation brain
 * (Madal Phase 3): narration → classify+confirm → one-question gap loop → guarded
 * draft → read-back/correction loop → explicit logged approval. Session state in
 * Redis; LLM calls injected; no channel knowledge anywhere.
 */
export {
  createLettersOrchestrator,
  mergeFacts,
  type DraftRequest,
  type LettersOrchestrator,
  type LettersOrchestratorDeps,
  type LetterTurnResult,
  type SessionStore,
} from "./orchestrator.js";
export { createDefaultLettersOrchestrator, type DefaultLettersOrchestratorOptions } from "./default.js";
export { chunkReadback, TTS_CHUNK_LIMIT } from "./readback.js";
export { QUESTIONS, LISTEN_PROMPT, READBACK_PROMPT, confirmTypePrompt, type LetterQuestion } from "./questions.js";
export { isApproval, isDontKnow, isNo, isYes } from "./intents.js";
