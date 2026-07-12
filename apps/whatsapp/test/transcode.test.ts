import { describe, it, expect } from "vitest";
import { patchWavSizes } from "../src/transcode.js";

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
