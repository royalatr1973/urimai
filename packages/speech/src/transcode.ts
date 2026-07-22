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

/**
 * Split a PCM WAV into segments of at most `maxSeconds` each — so voice notes longer
 * than an ASR provider's per-request cap (Sarvam: 30s) transcribe as several chunks
 * that the caller stitches back together. Pure PCM math on the canonical 16k-mono WAV
 * (no re-encode). Returns the WAV unchanged in a single-element array when it fits or
 * cannot be parsed (the caller just transcribes it as one piece).
 */
export function splitWav(wav: Buffer, maxSeconds = 28, maxSegments = 8): Buffer[] {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    return [wav];
  }
  // Locate fmt fields and the data chunk.
  let off = 12;
  let channels = 1;
  let sampleRate = 16000;
  let bitsPerSample = 16;
  let dataStart = -1;
  let dataLen = 0;
  while (off + 8 <= wav.length) {
    const id = wav.toString("ascii", off, off + 4);
    const size = wav.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt " && body + 16 <= wav.length) {
      channels = wav.readUInt16LE(body + 2) || 1;
      sampleRate = wav.readUInt32LE(body + 4) || 16000;
      bitsPerSample = wav.readUInt16LE(body + 14) || 16;
    } else if (id === "data") {
      dataStart = body;
      dataLen = size === 0xffffffff ? wav.length - body : Math.min(size, wav.length - body);
      break;
    }
    if (size === 0xffffffff) break;
    off = body + size + (size % 2);
  }
  if (dataStart < 0) return [wav];

  const blockAlign = (channels * bitsPerSample) / 8 || 2;
  let bytesPerSeg = Math.floor(sampleRate * blockAlign * maxSeconds);
  bytesPerSeg -= bytesPerSeg % blockAlign; // whole sample frames
  if (bytesPerSeg <= 0 || dataLen <= bytesPerSeg) return [wav];

  const data = wav.subarray(dataStart, dataStart + dataLen);
  const buildWav = (slice: Buffer): Buffer => {
    const h = Buffer.alloc(44);
    h.write("RIFF", 0, "ascii");
    h.writeUInt32LE(36 + slice.length, 4);
    h.write("WAVE", 8, "ascii");
    h.write("fmt ", 12, "ascii");
    h.writeUInt32LE(16, 16);
    h.writeUInt16LE(1, 20); // PCM
    h.writeUInt16LE(channels, 22);
    h.writeUInt32LE(sampleRate, 24);
    h.writeUInt32LE(sampleRate * blockAlign, 28);
    h.writeUInt16LE(blockAlign, 32);
    h.writeUInt16LE(bitsPerSample, 34);
    h.write("data", 36, "ascii");
    h.writeUInt32LE(slice.length, 40);
    return Buffer.concat([h, slice]);
  };

  const segments: Buffer[] = [];
  for (let i = 0; i < data.length && segments.length < maxSegments; i += bytesPerSeg) {
    segments.push(buildWav(data.subarray(i, Math.min(i + bytesPerSeg, data.length))));
  }
  return segments;
}

/** Inbound: OGG/Opus voice note → WAV (16k mono) for ASR. */
export const transcodeOggToWav: Transcoder = (input) =>
  runFfmpeg(["-i", "pipe:0", "-ar", "16000", "-ac", "1", "-f", "wav", "pipe:1"], input).then(patchWavSizes);

/** Outbound: WAV from TTS → OGG/Opus voice note for WhatsApp. */
export const transcodeWavToOggOpus: Transcoder = (input) =>
  runFfmpeg(["-i", "pipe:0", "-c:a", "libopus", "-b:a", "24k", "-ar", "48000", "-ac", "1", "-f", "ogg", "pipe:1"], input);
