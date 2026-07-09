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
import { documentChecklistTextTamil, renderDocumentCardSvg } from "./card.js";
import { CARDS_INTRO_TAMIL, CONDITION_CARDS, loadCardImage } from "./cards.js";
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
  isNewSession(sessionId: string): Promise<boolean>;
}

export interface HandlerDeps {
  orchestrator: OrchestratorLike;
  /** Tamil ASR/TTS. Optional: without it the channel runs TEXT-ONLY — replies are sent as
   * Tamil text and voice notes get a polite "please type" nudge. Lets WhatsApp go live
   * before Bhashini/Sarvam keys exist; voice switches on automatically once configured. */
  speech: SpeechProvider | null;
  whatsapp: WhatsAppClient;
  transcode: Transcoder;
  loadSchemes: () => Promise<Scheme[]>;
  escalation: EscalationQueue;
  /** Optional SVG→PNG rasterizer for cards (Meta needs PNG/JPEG). Falls back to raw SVG. */
  rasterize?: (svg: string) => Promise<{ bytes: Buffer; mimeType: string }>;
  /** Card-PNG loader, injectable for tests. Defaults to reading assets/cards/ from disk. */
  loadCardImage?: (file: string) => Promise<Buffer>;
  /** Injected clock for deterministic tests. */
  now?: () => string;
  helplineText?: string;
}

const MSG = {
  /**
   * Sent as the FIRST message on any fresh session (empty profile). Locates the
   * authority (final decision = government officer), names what Urimai is (a helper
   * service, not the government), and reassures on data safety. The citizen's implicit
   * consent is their continued interaction after seeing this.
   */
  opening:
    "வணக்கம். இது ஒரு உதவி சேவை, அரசு அல்ல. நான் உங்களுக்கு எந்த திட்டங்களுக்கு தகுதி இருக்கலாம் என்று மட்டும் சொல்ல முடியும் — இறுதி முடிவு அரசு அதிகாரிதான். நான் சொல்வது ஒரு வழிகாட்டி மட்டுமே. உங்கள் தகவல்கள் பாதுகாப்பாக வைக்கப்படும்.",
  unsupported: "தயவுசெய்து உங்கள் நிலையை குரல் செய்தியாக அல்லது எழுத்தாக அனுப்புங்கள்.",
  handoff: "ஒரு உதவியாளர் விரைவில் உங்களைத் தொடர்புகொள்வார்.",
  reset: "சரி, புதிதாகத் தொடங்குகிறோம். இந்த நபரின் நிலையைச் சொல்லுங்கள்.",
  voiceNotReady: "தற்போது குரல் செய்திகளை கேட்க முடியவில்லை — தயவுசெய்து எழுத்தாக அனுப்புங்கள்.",
};

export function createMessageHandler(deps: HandlerDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const loadCard = deps.loadCardImage ?? loadCardImage;

  // Sessions that already received the four condition cards — sent once per session, on
  // the FIRST results message (repeat messages after results must not re-spam 4 images).
  // In-memory on purpose (tier-1 scale): a server restart re-sends at most once, which is
  // gentler than adding a Redis dependency here. Cleared on "new person" reset.
  const conditionCardsSentTo = new Set<string>();

  /** Voice when speech is configured; Tamil text otherwise. */
  async function speak(to: string, tamil: string): Promise<void> {
    if (!deps.speech) {
      await deps.whatsapp.sendText(to, tamil);
      return;
    }
    const { audio, mimeType } = await deps.speech.synthesize(tamil, { targetLang: "ta-IN" });
    // WhatsApp voice notes are OGG/Opus; if the provider returns WAV, a production setup
    // transcodes on the way out too. We pass the provider mime through here.
    await deps.whatsapp.sendAudio(to, audio, mimeType);
  }

  /** Turn a WhatsApp inbound into a normalized text utterance. */
  async function toText(msg: InboundMessage): Promise<string | null> {
    if (msg.kind === "text") return msg.text ?? "";
    if (msg.kind === "audio" && msg.mediaId) {
      if (!deps.speech) return null; // text-only mode: can't transcribe yet
      const ogg = await deps.whatsapp.downloadMedia(msg.mediaId);
      const wav = await deps.transcode(ogg);
      return deps.speech.transcribe(wav, { sourceLang: "ta-IN" });
    }
    return null;
  }

  async function handleInbound(msg: InboundMessage): Promise<void> {
    const text = await toText(msg);
    if (text === null) {
      const nudge = msg.kind === "audio" && !deps.speech ? MSG.voiceNotReady : MSG.unsupported;
      await deps.whatsapp.sendText(msg.from, nudge);
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
      conditionCardsSentTo.delete(`wa:${msg.from}`); // new person → they get the cards too
      await speak(msg.from, MSG.reset);
      return;
    }

    // First-ever contact: play the opening disclaimer BEFORE the turn is processed.
    // Locates authority (officer decides), names what Urimai is (a helper, not government),
    // reassures on data safety. Implicit consent is continued interaction after this message.
    const sessionId = `wa:${msg.from}`;
    if (await deps.orchestrator.isNewSession(sessionId)) {
      await speak(msg.from, MSG.opening);
    }

    // Reuse the channel-agnostic orchestrator unchanged.
    const result = await deps.orchestrator.handleTurn(sessionId, text);

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
      // One failed checklist must not abort the rest of the reply (cards below still go).
      try {
        if (deps.rasterize) {
          const img = await deps.rasterize(renderDocumentCardSvg(scheme));
          await deps.whatsapp.sendImage(msg.from, img.bytes, img.mimeType, scheme.nameTamil);
        } else {
          // Meta's media API accepts PNG/JPEG only — raw SVG always 400s. Without a
          // rasterizer, send the same checklist as Tamil text instead.
          await deps.whatsapp.sendText(msg.from, documentChecklistTextTamil(scheme));
        }
      } catch (err) {
        console.error(`[whatsapp] document checklist for ${scheme.id} failed:`, err);
      }
    }

    // Then, once per session: ALL FOUR condition cards (curator decision — household
    // coverage on shared phones; the cards carry their own official-confirmation
    // disclaimer). Marked sent BEFORE sending: a partial failure must degrade to
    // "some cards missing", never to re-spamming four images on the next message.
    if (!conditionCardsSentTo.has(sessionId)) {
      conditionCardsSentTo.add(sessionId);
      try {
        await deps.whatsapp.sendText(msg.from, CARDS_INTRO_TAMIL);
      } catch (err) {
        console.error("[whatsapp] cards intro failed:", err);
      }
      for (const card of CONDITION_CARDS) {
        try {
          const bytes = await loadCard(card.file);
          await deps.whatsapp.sendImage(msg.from, bytes, "image/png", card.captionTamil);
        } catch (err) {
          console.error(`[whatsapp] condition card ${card.file} failed to send:`, err);
        }
      }
    }
  }

  return { handleInbound };
}

export type MessageHandler = ReturnType<typeof createMessageHandler>;
