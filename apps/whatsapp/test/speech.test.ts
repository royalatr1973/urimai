import { describe, it, expect, vi } from "vitest";
import { FallbackSpeechProvider, SarvamSpeechProvider, createSpeechProvider, type SpeechProvider } from "../src/speech.js";

const stub = (name: string, over: Partial<SpeechProvider> = {}): SpeechProvider => ({
  name,
  transcribe: async () => `${name}-text`,
  synthesize: async () => ({ audio: Buffer.from(name), mimeType: "audio/wav" }),
  ...over,
});

describe("FallbackSpeechProvider", () => {
  it("uses the primary when it succeeds", async () => {
    const fp = new FallbackSpeechProvider(stub("primary"), stub("fallback"));
    expect(await fp.transcribe(Buffer.from("x"))).toBe("primary-text");
  });

  it("falls back to the secondary when the primary throws", async () => {
    const primary = stub("primary", { transcribe: vi.fn(async () => { throw new Error("down"); }) });
    const fp = new FallbackSpeechProvider(primary, stub("fallback"));
    expect(await fp.transcribe(Buffer.from("x"))).toBe("fallback-text");
  });
});

describe("createSpeechProvider", () => {
  it("wires primary→fallback when both are configured", () => {
    const p = createSpeechProvider({
      provider: "bhashini",
      bhashini: { apiKey: "k", userId: "u", pipelineId: "p" },
      sarvam: { apiKey: "s" },
    });
    expect(p.name).toBe("bhashini->sarvam");
  });

  it("returns the single configured provider with no fallback", () => {
    const p = createSpeechProvider({ provider: "sarvam", sarvam: { apiKey: "s" } });
    expect(p).toBeInstanceOf(SarvamSpeechProvider);
  });

  it("throws when the chosen primary has no config", () => {
    expect(() => createSpeechProvider({ provider: "bhashini", sarvam: { apiKey: "s" } })).toThrow();
  });
});
