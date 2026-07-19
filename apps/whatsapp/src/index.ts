/**
 * @urimai/whatsapp — the WhatsApp voice channel (Phase 5).
 *
 * Reuses the Phase 3 orchestrator unchanged. The channel-specific rendering (document
 * cards, Tamil reply text, the handler) lives here; the shared plumbing was extracted to
 * packages (@urimai/speech, @urimai/whatsapp-client, @urimai/escalation — Madal Phase 0)
 * and is re-exported for compatibility.
 */
export { createMessageHandler, type HandlerDeps, type MessageHandler, type OrchestratorLike } from "./handler.js";
export { renderDocumentCardSvg } from "./card.js";
export { buildResultsSummaryTamil } from "./reply.js";
export {
  createSpeechProvider,
  FallbackSpeechProvider,
  BhashiniSpeechProvider,
  SarvamSpeechProvider,
  transcodeOggToWav,
  type SpeechProvider,
  type SpeechConfig,
  type Transcoder,
} from "@urimai/speech";
export {
  MetaWhatsAppClient,
  parseInbound,
  verifyChallenge,
  verifySignature,
  type InboundMessage,
  type WhatsAppClient,
} from "@urimai/whatsapp-client";
export { isHelpRequest, isResetRequest, RedisEscalationQueue, type EscalationQueue, type EscalationTicket } from "@urimai/escalation";
