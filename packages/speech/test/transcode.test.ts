import { describe, it, expect } from "vitest";
import { patchWavSizes, splitWav } from "../src/transcode.js";

/** Minimal WAV: RIFF header + fmt chunk (16 bytes) + data chunk with `dataBytes` of audio. */
function wav(dataBytes: number, riffSize: number, dataSize: number): Buffer {
  const b = Buffer.alloc(44 + dataBytes);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(riffSize, 4);
  b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii");
  b.writeUInt32LE(16, 16); // fmt chunk size
  b.write("data", 36, "ascii");
  b.writeUInt32LE(dataSize, 40);
  return b;
}

/** A canonical 16k-mono-16bit WAV holding `seconds` of audio. */
function wavSeconds(seconds: number): Buffer {
  const bytesPerSec = 16000 * 1 * 2;
  const dataBytes = Math.round(seconds * bytesPerSec);
  const b = wav(dataBytes, 36 + dataBytes, dataBytes);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(16000, 24); // sample rate
  b.writeUInt32LE(bytesPerSec, 28); // byte rate
  b.writeUInt16LE(2, 32); // block align
  b.writeUInt16LE(16, 34); // bits per sample
  return b;
}

describe("patchWavSizes", () => {
  it("fixes the 0xFFFFFFFF placeholders ffmpeg leaves when writing WAV to a pipe", () => {
    // Header-trusting ASR services read this as a ~37-hour file (Sarvam: bogus 402).
    const broken = wav(1000, 0xffffffff, 0xffffffff);
    const fixed = patchWavSizes(broken);
    expect(fixed.readUInt32LE(4)).toBe(fixed.length - 8);
    expect(fixed.readUInt32LE(40)).toBe(1000);
  });

  it("leaves non-WAV buffers untouched", () => {
    const notWav = Buffer.from("OggS this is not a wav file at all, just bytes......");
    expect(patchWavSizes(Buffer.from(notWav))).toEqual(notWav);
  });
});

describe("splitWav — chunk long voice notes under the ASR 30s cap", () => {
  const bytesPerSec = 16000 * 2;
  const durationOf = (w: Buffer) => (w.length - 44) / bytesPerSec;

  it("returns a short note as a single piece, unchanged", () => {
    const short = wavSeconds(10);
    const out = splitWav(short, 28);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(short); // fits — returned as-is
  });

  it("splits a 60s note into ≤28s chunks that account for all the audio", () => {
    const out = splitWav(wavSeconds(60), 28);
    expect(out.length).toBe(3); // 28 + 28 + 4
    for (const c of out) {
      expect(c.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(durationOf(c)).toBeLessThanOrEqual(28);
    }
    // Every second is preserved across the chunks (no audio dropped).
    const total = out.reduce((s, c) => s + durationOf(c), 0);
    expect(total).toBeCloseTo(60, 1);
  });

  it("each chunk is a valid standalone WAV (RIFF/WAVE/fmt/data) at the source format", () => {
    const [c] = splitWav(wavSeconds(45), 28);
    expect(c!.toString("ascii", 8, 12)).toBe("WAVE");
    expect(c!.readUInt32LE(24)).toBe(16000); // sample rate carried through
    expect(c!.readUInt16LE(22)).toBe(1); // mono
    expect(c!.readUInt32LE(40)).toBe(c!.length - 44); // data size correct
  });

  it("caps runaway inputs at maxSegments so a misfired long recording can't explode", () => {
    const out = splitWav(wavSeconds(600), 28, 8);
    expect(out.length).toBe(8);
  });

  it("returns non-WAV / unparseable buffers as a single piece", () => {
    const junk = Buffer.from("not a wav");
    expect(splitWav(junk, 28)).toEqual([junk]);
  });
});
