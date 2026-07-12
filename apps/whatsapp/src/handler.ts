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
import { buildProgressRecapTamil, buildResultsSummaryTamil } from "./reply.js";
import type { EscalationQueue } from "./escalation.js";
import type { SpeechProvider } from "./speech.js";
import type { Transcoder } from "./transcode.js";
import type { InboundMessage, WhatsAppClient } from "./whatsapp.js";

/** Just the slice of the orchestrator the channel uses — proves it's reused, not modified. */
export interface OrchestratorLike {
  handleTurn(sessionId: string, text: string): Promise<TurnResult>;
  resetSession(sessionId: string): Promise<void>;
  /** Fresh conversation without user text — returns the first question, pendingField armed. */
  startSession(sessionId: string): Promise<TurnResult>;
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
  /** Outbound WAV→OGG/Opus for voice replies (WhatsApp rejects audio/wav uploads). */
  transcodeOut?: Transcoder;
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
   * service, not the government), warns that a few questions (income, property) may
   * feel difficult and are used only for scheme-eligibility assessment, then ASKS
   * "may I ask the questions?" and WAITS — curator decision, July 2026: explicit
   * consent, not announced consent. No question is asked until the citizen accepts.
   */
  opening:
    "வணக்கம். இது ஒரு உதவி சேவை, அரசு அல்ல. அரசு நலத்திட்டங்களுக்கான உங்கள் தகுதியை அறிய நான் உதவுவேன் — இறுதி முடிவு அரசு அதிகாரிதான். " +
    "அதற்காக சில கேள்விகள் கேட்க வேண்டும். வருமானம், சொத்து போன்ற சில கேள்விகள் சொல்வதற்கு தயக்கமாக இருக்கலாம் — ஆனால் அவை திட்டத் தகுதி மதிப்பீட்டிற்கு மட்டுமே பயன்படும், பாதுகாப்பாக வைக்கப்படும். கேள்விகளைக் கேட்கலாமா?",
  /** Polite exit when the citizen declines the consent question. */
  declined: "சரி, பரவாயில்லை. உங்களுக்கு விருப்பம் வரும்போது 'வணக்கம்' என்று அனுப்புங்கள். நன்றி.",
  unsupported: "தயவுசெய்து உங்கள் நிலையை குரல் செய்தியாக அல்லது எழுத்தாக அனுப்புங்கள்.",
  // No operator callback is offered (curator decision: we can't staff it, so we don't
  // promise it) — "உதவி" gets honest direction to the real-world help desk instead.
  handoff: "நேரடி உதவிக்கு, உங்கள் அருகிலுள்ள இ-சேவை மையம் அல்லது வட்டாட்சியர் அலுவலகத்தை அணுகவும்.",
  // Reset acknowledgement only — the first concrete question (age) is appended by the
  // handler via startSession, so the conversation moves immediately (curator decision).
  reset: "சரி, புதிதாகத் தொடங்குகிறோம்.",
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

  // Consent gate (curator decision, July 2026): the opening ends with "கேள்விகளைக்
  // கேட்கலாமா?" and we WAIT. awaitingConsent stashes the first message's text so any
  // substance in it ("I'm a 67-year-old widow…") isn't lost — it's folded into the first
  // real turn once they accept. consented remembers acceptance for empty-profile sessions
  // (the profile alone can't tell "brand new" from "accepted but nothing extracted yet").
  // In-memory: a restart re-asks consent at most once. Cleared on "new person" reset.
  const awaitingConsent = new Map<string, string>();
  const consented = new Set<string>();

  /** A refusal to the consent question — a short, whole-message "no". */
  const DECLINE_EXACT = new Set(["வேண்டாம்", "இல்லை", "மாட்டேன்", "no", "illai", "vendam", "stop"]);
  const isDecline = (t: string) => DECLINE_EXACT.has(t.trim().toLowerCase().replace(/[.!]+$/, ""));

  /**
   * Voice when speech is configured; Tamil text otherwise. Voice-first, §2.4: the voice
   * note must be sufficient on its own — so voice mode sends VOICE ONLY (curator decision,
   * July 2026: the text duplicate alongside every voice note felt like clutter; temporary,
   * revisit with tester feedback). Text still goes out when synthesis or upload fails —
   * voice trouble must never leave a citizen with silence.
   */
  async function speak(to: string, tamil: string): Promise<void> {
    if (!deps.speech) {
      await deps.whatsapp.sendText(to, tamil);
      return;
    }
    try {
      let { audio, mimeType } = await deps.speech.synthesize(tamil, { targetLang: "ta-IN" });
      if (mimeType === "audio/wav") {
        // WhatsApp's media API rejects WAV — convert to an OGG/Opus voice note.
        if (!deps.transcodeOut) throw new Error("TTS returned WAV but no outbound transcoder is configured");
        audio = await deps.transcodeOut(audio);
        mimeType = "audio/ogg";
      }
      await deps.whatsapp.sendAudio(to, audio, mimeType);
    } catch (err) {
      console.error("[whatsapp] voice reply failed — falling back to text:", err instanceof Error ? err.message : err);
      await deps.whatsapp.sendText(to, tamil);
    }
  }

  /** Turn a WhatsApp inbound into a normalized text utterance. */
  async function toText(msg: InboundMessage): Promise<string | null> {
    if (msg.kind === "text") return msg.text ?? "";
    if (msg.kind === "audio" && msg.mediaId) {
      if (!deps.speech) return null; // text-only mode: can't transcribe yet
      // ASR trouble (provider down, out of credits) must degrade to the "please type"
      // nudge — a citizen who sent a voice note must never get silence back.
      try {
        const ogg = await deps.whatsapp.downloadMedia(msg.mediaId);
        const wav = await deps.transcode(ogg);
        return await deps.speech.transcribe(wav, { sourceLang: "ta-IN" });
      } catch (err) {
        console.error("[whatsapp] voice note transcription failed:", err instanceof Error ? err.message : err);
        return null;
      }
    }
    return null;
  }

  async function handleInbound(msg: InboundMessage): Promise<void> {
    const text = await toText(msg);
    if (text === null) {
      const nudge = msg.kind === "audio" ? MSG.voiceNotReady : MSG.unsupported;
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

    // "new person" → clear the session, then open DIRECTLY with the first question (age).
    // The resetter is already mid-interaction, so the consent gate is not re-run — the
    // disclaimer was heard on this phone at first contact (curator decision, July 2026).
    if (isResetRequest(text)) {
      const sid = `wa:${msg.from}`;
      await deps.orchestrator.resetSession(sid);
      conditionCardsSentTo.delete(sid); // new person → they get the cards too
      awaitingConsent.delete(sid);
      consented.add(sid);
      const first = await deps.orchestrator.startSession(sid);
      const firstQuestion = first.kind === "question" ? ` ${first.question.ta}` : "";
      await speak(msg.from, MSG.reset + firstQuestion);
      return;
    }

    const sessionId = `wa:${msg.from}`;

    // First-ever contact: opening disclaimer, ending with the consent question — then
    // WAIT. No orchestration until the citizen accepts. Their first message's text is
    // stashed so nothing they volunteered is lost.
    if (!consented.has(sessionId) && !awaitingConsent.has(sessionId) && (await deps.orchestrator.isNewSession(sessionId))) {
      awaitingConsent.set(sessionId, text);
      await speak(msg.from, MSG.opening);
      return;
    }

    // The reply to the consent question: a whole-message "no" ends politely; anything
    // else — a yes, or them simply starting to describe their situation — is acceptance.
    let turnText = text;
    if (awaitingConsent.has(sessionId)) {
      const stashed = awaitingConsent.get(sessionId)!;
      awaitingConsent.delete(sessionId);
      if (isDecline(text)) {
        await speak(msg.from, MSG.declined);
        return;
      }
      consented.add(sessionId);
      turnText = `${stashed} ${text}`.trim();
    } else {
      consented.add(sessionId); // continuing session (e.g. after restart) — consent stands
    }

    // Reuse the channel-agnostic orchestrator unchanged.
    const result = await deps.orchestrator.handleTurn(sessionId, turnText);

    if (result.kind === "question") {
      const parts: string[] = [];
      // Progress recap before question 5, 9, 13… (curator feedback: after 4 answers,
      // say what we've learned, which schemes remain, and ask for patience).
      const n = result.questionsAsked ?? 0;
      if (n >= 5 && (n - 1) % 4 === 0) {
        const schemes = await deps.loadSchemes();
        const byId = Object.fromEntries(schemes.map((s) => [s.id, s]));
        parts.push(buildProgressRecapTamil(result.profile, result.verdicts, byId));
      }
      // Delicate questions carry their curator-written purpose line first.
      if (result.question.purposeTa) parts.push(result.question.purposeTa);
      parts.push(result.question.ta);
      await speak(msg.from, parts.join(" "));
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
