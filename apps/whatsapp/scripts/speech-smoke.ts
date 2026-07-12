/**
 * Live speech smoke test — run the moment Bhashini/Sarvam keys land in .env:
 *
 *   cd apps/whatsapp && node --env-file=../../.env --import tsx scripts/speech-smoke.ts
 *
 * Round-trips the real voice pipeline with live APIs:
 *   1. TTS: Tamil text → audio (writes .live/smoke-tts.{mp3|wav} so you can listen)
 *   2. If WAV: transcode to OGG/Opus (the WhatsApp outbound path)
 *   3. ASR: synthesize a known Tamil sentence, feed it back → compare transcript
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { createSpeechProvider } from "../src/speech.js";
import { transcodeWavToOggOpus, transcodeOggToWav } from "../src/transcode.js";

const env = process.env;
const TEST_SENTENCE = "எனக்கு வயது அறுபத்தேழு, நான் ஒரு விதவை"; // "I am 67, I am a widow"

async function main() {
  const provider = createSpeechProvider({
    provider: (env.SPEECH_PROVIDER as "bhashini" | "sarvam") ?? "bhashini",
    bhashini:
      env.BHASHINI_API_KEY && env.BHASHINI_USER_ID && env.BHASHINI_PIPELINE_ID
        ? { apiKey: env.BHASHINI_API_KEY, userId: env.BHASHINI_USER_ID, pipelineId: env.BHASHINI_PIPELINE_ID }
        : undefined,
    sarvam: env.SARVAM_API_KEY ? { apiKey: env.SARVAM_API_KEY } : undefined,
  });
  console.log(`provider: ${provider.name}\n`);
  mkdirSync(".live", { recursive: true });

  // 1. TTS
  console.log(`TTS: "${TEST_SENTENCE}"`);
  const tts = await provider.synthesize(TEST_SENTENCE, { targetLang: "ta-IN" });
  const ext = tts.mimeType === "audio/mpeg" ? "mp3" : "wav";
  writeFileSync(`.live/smoke-tts.${ext}`, tts.audio);
  console.log(`  ✓ ${tts.audio.length} bytes (${tts.mimeType}) → .live/smoke-tts.${ext} — LISTEN to this file\n`);

  // 2. Outbound transcode path (only exercised for WAV producers like Bhashini)
  let asrInput: Buffer;
  if (tts.mimeType === "audio/wav") {
    const ogg = await transcodeWavToOggOpus(tts.audio);
    writeFileSync(".live/smoke-tts.ogg", ogg);
    console.log(`  ✓ WAV→OGG/Opus ${ogg.length} bytes (WhatsApp outbound path works)\n`);
    asrInput = tts.audio;
  } else {
    // MP3 out (Sarvam): decode to WAV for the ASR leg, mimicking the inbound path.
    asrInput = await transcodeOggToWav(tts.audio); // ffmpeg sniffs the container; ogg-in name is historical
    console.log(`  ✓ MP3→WAV ${asrInput.length} bytes for the ASR leg\n`);
  }

  // 3. ASR round trip
  console.log("ASR: transcribing the synthesized audio back...");
  const transcript = await provider.transcribe(asrInput, { sourceLang: "ta-IN" });
  console.log(`  heard: "${transcript}"`);
  console.log(`  sent : "${TEST_SENTENCE}"`);
  console.log(transcript.includes("விதவை") || transcript.includes("67") || transcript.includes("அறுபத்")
    ? "\n✅ ROUND TRIP OK — voice pipeline is live."
    : "\n⚠ transcript differs — listen to .live/smoke-tts file and judge; ASR wording can vary.");
}

main().catch((e) => {
  console.error("\n❌ smoke test failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
