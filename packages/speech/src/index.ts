/**
 * @urimai/speech — Tamil ASR/TTS providers (Bhashini primary, Sarvam fallback) and the
 * ffmpeg transcoders that sit at the channel edge. Extracted from apps/whatsapp so the
 * Madal letters channel can reuse the exact same plumbing (LETTERS_BRIEF.md §3).
 */
export {
  createSpeechProvider,
  FallbackSpeechProvider,
  BhashiniSpeechProvider,
  SarvamSpeechProvider,
  type SpeechProvider,
  type SpeechConfig,
} from "./speech.js";
export { transcodeOggToWav, transcodeWavToOggOpus, patchWavSizes, splitWav, type Transcoder } from "./transcode.js";
