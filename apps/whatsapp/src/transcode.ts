/**
 * WhatsApp voice notes arrive as OGG/Opus; ASR wants 16 kHz mono PCM WAV. This shells out
 * to ffmpeg. It's injected into the handler so tests don't need ffmpeg installed, and so
 * the binary dependency stays at the channel edge.
 */
import { spawn } from "node:child_process";

export type Transcoder = (oggOpus: Buffer) => Promise<Buffer>;

/** Default transcoder: ffmpeg OGG/Opus → WAV (16k mono). Requires ffmpeg on PATH. */
export const transcodeOggToWav: Transcoder = (input) =>
  new Promise<Buffer>((resolve, reject) => {
    const ff = spawn("ffmpeg", ["-i", "pipe:0", "-ar", "16000", "-ac", "1", "-f", "wav", "pipe:1"]);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    ff.stdout.on("data", (d) => out.push(d));
    ff.stderr.on("data", (d) => err.push(d));
    ff.on("error", (e) => reject(new Error(`ffmpeg spawn failed (is it installed?): ${e.message}`)));
    ff.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err).toString().slice(-300)}`));
    });
    ff.stdin.on("error", () => {/* ignore EPIPE if ffmpeg dies early */});
    ff.stdin.end(input);
  });
