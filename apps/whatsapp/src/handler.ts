/**
 * The WhatsApp message handler — the channel brain.
 *
 * It NORMALIZES WhatsApp input (voice note → transcode → ASR, or text) into (sessionId,
 * text), then calls the Phase 3 orchestrator's `handleTurn` UNCHANGED — the one-question-
 * at-a-time voice loop, where the highest-value-next-question picker finally earns its keep.
 * It RENDERS the normalized TurnResult back to voice (TTS) plus document-card images. The
 * orchestrator never learns this came from WhatsApp.
 *
 * "help" always short-circuits to a human, before any orchestration.
 */
import type { TurnResult } from "@urimai/orchestrator";
import type { Scheme } from "@urimai/types";
import { renderDocumentCardSvg } from "./card.js";
import { isHelpRequest, isResetRequest } from "./help.js";
import { buildResultsSummaryTamil } from "./reply.js";
import type { EscalationQueue } from "./escalation.js";
import type { SpeechProvider } from "./speech.js";
import type { Transcoder } from "./transcode.js";
import type { InboundMessage, WhatsAppClient } from "./whatsapp.js";

/** Just the slice of the orchestrator the channel uses — proves it's reused, not modified. */
export interface OrchestratorLike {
  handleTurn(sessionId: string, text: string): Promise<TurnResult>;
  resetSession(sessionId: string): Promise<void>;
}

export interface HandlerDeps {
  orchestrator: OrchestratorLike;
  speech: SpeechProvider;
  whatsapp: WhatsAppClient;
  transcode: Transcoder;
  loadSchemes: () => Promise<Scheme[]>;
  escalation: EscalationQueue;
  /** Optional SVG→PNG rasterizer for cards (Meta needs PNG/JPEG). Falls back to raw SVG. */
  rasterize?: (svg: string) => Promise<{ bytes: Buffer; mimeType: string }>;
  /** Injected clock for deterministic tests. */
  now?: () => string;
  helplineText?: string;
}

const MSG = {
  unsupported: "தயவுசெய்து உங்கள் நிலையை குரல் செய்தியாக அல்லது எழுத்தாக அனுப்புங்கள்.",
  handoff: "ஒரு உதவியாளர் விரைவில் உங்களைத் தொடர்புகொள்வார்.",
  reset: "சரி, புதிதாகத் தொடங்குகிறோம். இந்த நபரின் நிலையைச் சொல்லுங்கள்.",
};

export function createMessageHandler(deps: HandlerDeps) {
  const now = deps.now ?? (() => new Date().toISOString());

  async function speak(to: string, tamil: string): Promise<void> {
    const { audio, mimeType } = await deps.speech.synthesize(tamil, { targetLang: "ta-IN" });
    // WhatsApp voice notes are OGG/Opus; if the provider returns WAV, a production setup
    // transcodes on the way out too. We pass the provider mime through here.
    await deps.whatsapp.sendAudio(to, audio, mimeType);
  }

  /** Turn a WhatsApp inbound into a normalized text utterance. */
  async function toText(msg: InboundMessage): Promise<string | null> {
    if (msg.kind === "text") return msg.text ?? "";
    if (msg.kind === "audio" && msg.mediaId) {
      const ogg = await deps.whatsapp.downloadMedia(msg.mediaId);
      const wav = await deps.transcode(ogg);
      return deps.speech.transcribe(wav, { sourceLang: "ta-IN" });
    }
    return null;
  }

  async function handleInbound(msg: InboundMessage): Promise<void> {
    const text = await toText(msg);
    if (text === null) {
      await deps.whatsapp.sendText(msg.from, MSG.unsupported);
      return;
    }

    // "help" → human, always, before any decision logic.
    if (isHelpRequest(text)) {
      await deps.escalation.enqueue({ from: msg.from, text, reason: "help_requested", at: now() });
      if (deps.helplineText) await deps.whatsapp.sendText(msg.from, deps.helplineText);
      await speak(msg.from, MSG.handoff);
      return;
    }

    // "new person" → clear the session. Shared phones serve many beneficiaries; profiles
    // must never merge across people.
    if (isResetRequest(text)) {
      await deps.orchestrator.resetSession(`wa:${msg.from}`);
      await speak(msg.from, MSG.reset);
      return;
    }

    // Reuse the channel-agnostic orchestrator unchanged.
    const result = await deps.orchestrator.handleTurn(`wa:${msg.from}`, text);

    if (result.kind === "question") {
      await speak(msg.from, result.question.ta);
      return;
    }

    // results: speak a Tamil summary, then send a document card image per eligible scheme.
    const schemes = await deps.loadSchemes();
    const byId = Object.fromEntries(schemes.map((s) => [s.id, s]));
    await speak(msg.from, buildResultsSummaryTamil(result.verdicts, byId));

    for (const v of result.verdicts) {
      if (v.status !== "eligible") continue;
      const scheme = byId[v.schemeId];
      if (!scheme) continue;
      const svg = renderDocumentCardSvg(scheme);
      const img = deps.rasterize
        ? await deps.rasterize(svg)
        : { bytes: Buffer.from(svg), mimeType: "image/svg+xml" };
      await deps.whatsapp.sendImage(msg.from, img.bytes, img.mimeType, scheme.nameTamil);
    }
  }

  return { handleInbound };
}

export type MessageHandler = ReturnType<typeof createMessageHandler>;
