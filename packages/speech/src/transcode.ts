/**
 * WhatsApp voice notes arrive as OGG/Opus; ASR wants 16 kHz mono PCM WAV. And on the way
 * out, WhatsApp's media API accepts OGG/Opus (or MP3/AAC) but NOT WAV — so WAV-producing
 * TTS (Bhashini) needs the reverse trip. Both shell out to ffmpeg. They're injected into
 * the handler so tests don't need ffmpeg installed, and the binary dependency stays at the
 * channel edge. Set FFMPEG_PATH if ffmpeg is not on PATH.
 */
import { spawn } from "node:child_process";

export type Transcoder = (input: Buffer) => Promise<Buffer>;

const FFMPEG = () => process.env.FFMPEG_PATH ?? "ffmpeg";

function runFfmpeg(args: string[], input: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const ff = spawn(FFMPEG(), args);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    ff.stdout.on("data", (d) => out.push(d));
    ff.stderr.on("data", (d) => err.push(d));
    ff.on("error", (e) => reject(new Error(`ffmpeg spawn failed (is it installed / FFMPEG_PATH set?): ${e.message}`)));
    ff.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err).toString().slice(-300)}`));
    });
    ff.stdin.on("error", () => {/* ignore EPIPE if ffmpeg dies early */});
    ff.stdin.end(input);
  });
}

/**
 * ffmpeg writing WAV to a pipe cannot seek back to fill in the chunk sizes, so it leaves
 * 0xFFFFFFFF placeholders. Header-trusting ASR services then see a "37-hour" file —
 * Sarvam prices that and rejects with a misleading 402 "No credits available". Patch the
 * RIFF and data chunk sizes from the actual byte length.
 */
export function patchWavSizes(wav: Buffer): Buffer {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") return wav;
  wav.writeUInt32LE(wav.length - 8, 4);
  // Walk chunks to find "data" (fmt/LIST may precede it).
  let off = 12;
  while (off + 8 <= wav.length) {
    const id = wav.toString("ascii", off, off + 4);
    if (id === "data") {
      wav.writeUInt32LE(wav.length - (off + 8), off + 4);
      break;
    }
    const size = wav.readUInt32LE(off + 4);
    if (size === 0xffffffff) break; // corrupt intermediate chunk; leave as-is
    off += 8 + size + (size % 2);
  }
  return wav;
}

/** Inbound: OGG/Opus voice note → WAV (16k mono) for ASR. */
export const transcodeOggToWav: Transcoder = (input) =>
  runFfmpeg(["-i", "pipe:0", "-ar", "16000", "-ac", "1", "-f", "wav", "pipe:1"], input).then(patchWavSizes);

/** Outbound: WAV from TTS → OGG/Opus voice note for WhatsApp. */
export const transcodeWavToOggOpus: Transcoder = (input) =>
  runFfmpeg(["-i", "pipe:0", "-c:a", "libopus", "-b:a", "24k", "-ar", "48000", "-ac", "1", "-f", "ogg", "pipe:1"], input);
