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

  it("uses the OTHER provider when the chosen primary has no config (half-configured .env still gives voice)", () => {
    const p = createSpeechProvider({ provider: "bhashini", sarvam: { apiKey: "s" } });
    expect(p).toBeInstanceOf(SarvamSpeechProvider);
  });

  it("throws only when NEITHER provider is configured", () => {
    expect(() => createSpeechProvider({ provider: "bhashini" })).toThrow();
  });
});

describe("Sarvam wire shapes (verified against docs.sarvam.ai, July 2026)", () => {
  it("synthesize sends bulbul:v2 + mp3 codec and returns audio/mpeg", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ audios: [Buffer.from("MP3").toString("base64")] }), { status: 200 }),
    );
    try {
      const p = new SarvamSpeechProvider("key");
      const out = await p.synthesize("வணக்கம்");
      expect(out.mimeType).toBe("audio/mpeg");
      expect(out.audio.toString()).toBe("MP3");
      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(String(url)).toContain("/text-to-speech");
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.model).toBe("bulbul:v2");
      expect(body.speaker).toBe("anushka");
      expect(body.output_audio_codec).toBe("mp3");
      expect(body.text).toBe("வணக்கம்");
      expect(body.target_language_code).toBe("ta-IN");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("transcribe posts hand-rolled multipart (explicit content-length) with saarika:v2.5", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ transcript: "எனக்கு வயசு 67" }), { status: 200 }),
    );
    try {
      const p = new SarvamSpeechProvider("key");
      expect(await p.transcribe(Buffer.from("WAV"))).toBe("எனக்கு வயசு 67");
      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = (init as RequestInit).headers as Record<string, string>;
      // Chunked FormData trips Sarvam's edge (bogus 402) — the body must be a sized Buffer.
      const body = (init as RequestInit).body as Buffer;
      expect(Buffer.isBuffer(body)).toBe(true);
      expect(headers["content-length"]).toBe(String(body.length));
      expect(headers["content-type"]).toContain("multipart/form-data; boundary=");
      const text = body.toString("utf8");
      expect(text).toContain('name="model"');
      expect(text).toContain("saarika:v2.5");
      expect(text).toContain('name="language_code"');
      expect(text).toContain("ta-IN");
      expect(text).toContain("WAV");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("Bhashini two-step flow (config → compute)", () => {
  const CONFIG_RESPONSE = {
    pipelineInferenceAPIEndPoint: {
      callbackUrl: "https://dhruva.example/infer",
      inferenceApiKey: { name: "Authorization", value: "SECRET" },
    },
    pipelineResponseConfig: [
      { taskType: "asr", config: [{ serviceId: "asr-svc" }] },
      { taskType: "tts", config: [{ serviceId: "tts-svc" }] },
    ],
  };

  it("resolves the pipeline once, then computes ASR with the resolved serviceId + auth", async () => {
    const { BhashiniSpeechProvider } = await import("../src/speech.js");
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(CONFIG_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ pipelineResponse: [{ output: [{ source: "விதவை" }] }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ pipelineResponse: [{ output: [{ source: "இரண்டாவது" }] }] }), { status: 200 }),
      );
    try {
      const p = new BhashiniSpeechProvider({ apiKey: "ulca-key", userId: "uid", pipelineId: "pid" });
      expect(await p.transcribe(Buffer.from("WAV"))).toBe("விதவை");

      // Config call carried the ULCA headers.
      const [, cfgInit] = fetchSpy.mock.calls[0]!;
      expect((cfgInit as RequestInit).headers).toMatchObject({ userID: "uid", ulcaApiKey: "ulca-key" });

      // Compute call went to the callback with the inference key and the asr serviceId.
      const [computeUrl, computeInit] = fetchSpy.mock.calls[1]!;
      expect(String(computeUrl)).toBe("https://dhruva.example/infer");
      expect((computeInit as RequestInit).headers).toMatchObject({ Authorization: "SECRET" });
      const body = JSON.parse((computeInit as RequestInit).body as string);
      expect(body.pipelineTasks[0].config.serviceId).toBe("asr-svc");
      expect(body.inputData.audio[0].audioContent).toBe(Buffer.from("WAV").toString("base64"));

      // Second transcribe: config is CACHED — only one more fetch (the compute).
      expect(await p.transcribe(Buffer.from("WAV2"))).toBe("இரண்டாவது");
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("synthesize returns WAV from audioContent (handler transcodes for WhatsApp)", async () => {
    const { BhashiniSpeechProvider } = await import("../src/speech.js");
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(CONFIG_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ pipelineResponse: [{ audio: [{ audioContent: Buffer.from("WAVOUT").toString("base64") }] }] }),
          { status: 200 },
        ),
      );
    try {
      const p = new BhashiniSpeechProvider({ apiKey: "k", userId: "u", pipelineId: "p" });
      const out = await p.synthesize("வணக்கம்");
      expect(out.mimeType).toBe("audio/wav");
      expect(out.audio.toString()).toBe("WAVOUT");
      const [, computeInit] = fetchSpy.mock.calls[1]!;
      const body = JSON.parse((computeInit as RequestInit).body as string);
      expect(body.pipelineTasks[0].taskType).toBe("tts");
      expect(body.pipelineTasks[0].config.serviceId).toBe("tts-svc");
      expect(body.inputData.input[0].source).toBe("வணக்கம்");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
