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
  type ResolvedAddressee,
  type SessionStore,
} from "./orchestrator.js";
export { createDefaultLettersOrchestrator, type DefaultLettersOrchestratorOptions } from "./default.js";
export { chunkChangedReadback, chunkReadback, TTS_CHUNK_LIMIT } from "./readback.js";
export {
  CHANGED_INTRO,
  CLARIFY_PROMPT,
  LISTEN_PROMPT,
  NO_CHANGE_NEEDED,
  CLOSED_PROMPT,
  DELIVERED_REVIEW_PROMPT,
  FEEDBACK_PROMPT,
  POST_DELIVERY_CLARIFY,
  QUESTIONS,
  READBACK_PROMPT,
  SPOKEN_DISCLAIMER,
  confirmTypePrompt,
  entityQuestion,
  type LetterQuestion,
} from "./questions.js";
export { classifyFeedback, type FeedbackVerdict } from "./feedback.js";
export { classifyReviewReply, isApproval, isDontKnow, isNo, isNoNeed, isYes, type ReviewReply } from "./intents.js";
