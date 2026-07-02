/**
 * @urimai/whatsapp — the WhatsApp voice channel (Phase 5).
 *
 * Reuses the Phase 3 orchestrator unchanged. Everything WhatsApp/voice-specific (OGG
 * transcode, ASR/TTS, Meta API, phone numbers, the document card) lives here, not in core.
 */
export { createMessageHandler, type HandlerDeps, type MessageHandler, type OrchestratorLike } from "./handler.js";
export { createSpeechProvider, FallbackSpeechProvider, BhashiniSpeechProvider, SarvamSpeechProvider, type SpeechProvider, type SpeechConfig } from "./speech.js";
export { MetaWhatsAppClient, parseInbound, verifyChallenge, verifySignature, type InboundMessage, type WhatsAppClient } from "./whatsapp.js";
export { renderDocumentCardSvg } from "./card.js";
export { isHelpRequest } from "./help.js";
export { buildResultsSummaryTamil } from "./reply.js";
export { RedisEscalationQueue, type EscalationQueue, type EscalationTicket } from "./escalation.js";
export { transcodeOggToWav, type Transcoder } from "./transcode.js";
