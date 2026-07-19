/**
 * Shared voice plumbing for the router + Madal renderer: speak Tamil (voice when
 * speech is configured, text otherwise, text on any voice failure — never silence),
 * and normalize an inbound message to text (voice note → transcode → ASR).
 *
 * Mirrors the behavior baked into the Urimai handler; kept separate so that handler
 * (live-tested) stays untouched.
 */
import type { SpeechProvider, Transcoder } from "@urimai/speech";
import type { InboundMessage, WhatsAppClient } from "@urimai/whatsapp-client";

export interface VoiceDeps {
  speech: SpeechProvider | null;
  whatsapp: WhatsAppClient;
  transcode: Transcoder; // inbound OGG → WAV
  transcodeOut?: Transcoder; // outbound WAV → OGG/Opus
}

export function createSpeaker(deps: VoiceDeps) {
  return async function speak(to: string, tamil: string): Promise<void> {
    if (!deps.speech) {
      await deps.whatsapp.sendText(to, tamil);
      return;
    }
    try {
      let { audio, mimeType } = await deps.speech.synthesize(tamil, { targetLang: "ta-IN" });
      if (mimeType === "audio/wav") {
        if (!deps.transcodeOut) throw new Error("TTS returned WAV but no outbound transcoder is configured");
        audio = await deps.transcodeOut(audio);
        mimeType = "audio/ogg";
      }
      await deps.whatsapp.sendAudio(to, audio, mimeType);
    } catch (err) {
      console.error("[whatsapp] voice reply failed — falling back to text:", err instanceof Error ? err.message : err);
      await deps.whatsapp.sendText(to, tamil);
    }
  };
}

/** Inbound → text. null = could not normalize (caller sends the appropriate nudge). */
export function createTranscriber(deps: VoiceDeps) {
  return async function toText(msg: InboundMessage): Promise<string | null> {
    if (msg.kind === "text") return msg.text ?? "";
    if (msg.kind === "audio" && msg.mediaId) {
      if (!deps.speech) return null;
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
  };
}
