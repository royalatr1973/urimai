/**
 * Tamil ASR/TTS behind one swappable interface, so either backend can be replaced and a
 * primary can fall back to a secondary. Bhashini is primary (govt, free), Sarvam is the
 * commercial fallback. (PROJECT_BRIEF.md §4.)
 *
 * ⚠️  The exact HTTP shapes below are best-effort and MUST be verified against the current
 *     Bhashini (ULCA) and Sarvam API docs before going live — treat them like the GO
 *     numbers: flagged, not trusted. The INTERFACE and the fallback wiring are the stable
 *     contract; the wire details are swappable.
 */

export interface SpeechProvider {
  readonly name: string;
  /** Tamil speech → text. `audio` is WAV/PCM (16k mono) after transcode. */
  transcribe(audio: Buffer, opts?: { sourceLang?: string }): Promise<string>;
  /** Tamil text → speech. Returns audio bytes + mime type. */
  synthesize(text: string, opts?: { targetLang?: string }): Promise<{ audio: Buffer; mimeType: string }>;
}

const TA = "ta-IN";

// --- Sarvam (commercial fallback) -------------------------------------------
export class SarvamSpeechProvider implements SpeechProvider {
  readonly name = "sarvam";
  constructor(private apiKey: string, private base = "https://api.sarvam.ai") {}

  async transcribe(audio: Buffer, opts?: { sourceLang?: string }): Promise<string> {
    // VERIFY against current Sarvam docs: POST /speech-to-text (multipart), model "saarika:v2".
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), "audio.wav");
    form.append("model", "saarika:v2");
    form.append("language_code", opts?.sourceLang ?? TA);
    const res = await fetch(`${this.base}/speech-to-text`, {
      method: "POST",
      headers: { "api-subscription-key": this.apiKey },
      body: form,
    });
    if (!res.ok) throw new Error(`sarvam STT ${res.status}`);
    const data = (await res.json()) as { transcript?: string };
    return data.transcript ?? "";
  }

  async synthesize(text: string, opts?: { targetLang?: string }): Promise<{ audio: Buffer; mimeType: string }> {
    // VERIFY: POST /text-to-speech (JSON) → { audios: [base64 wav] }.
    const res = await fetch(`${this.base}/text-to-speech`, {
      method: "POST",
      headers: { "api-subscription-key": this.apiKey, "content-type": "application/json" },
      body: JSON.stringify({ inputs: [text], target_language_code: opts?.targetLang ?? TA, speaker: "meera" }),
    });
    if (!res.ok) throw new Error(`sarvam TTS ${res.status}`);
    const data = (await res.json()) as { audios?: string[] };
    const b64 = data.audios?.[0];
    if (!b64) throw new Error("sarvam TTS: no audio returned");
    return { audio: Buffer.from(b64, "base64"), mimeType: "audio/wav" };
  }
}

// --- Bhashini (primary) ------------------------------------------------------
export class BhashiniSpeechProvider implements SpeechProvider {
  readonly name = "bhashini";
  constructor(
    private cfg: { apiKey: string; userId: string; pipelineId: string; inferenceUrl?: string },
  ) {}

  // NOTE: Bhashini's real flow is two-step (ULCA getModelsPipeline → inference callback).
  // This calls a configured inference endpoint directly with the pipeline id; VERIFY the
  // endpoint, headers, and payload against current Bhashini docs before production.
  private get url() {
    return this.cfg.inferenceUrl ?? "https://dhruva-api.bhashini.gov.in/services/inference/pipeline";
  }

  async transcribe(audio: Buffer, opts?: { sourceLang?: string }): Promise<string> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: this.cfg.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        pipelineId: this.cfg.pipelineId,
        userId: this.cfg.userId,
        task: "asr",
        sourceLanguage: opts?.sourceLang ?? "ta",
        audioBase64: audio.toString("base64"),
      }),
    });
    if (!res.ok) throw new Error(`bhashini ASR ${res.status}`);
    const data = (await res.json()) as { text?: string };
    return data.text ?? "";
  }

  async synthesize(text: string, opts?: { targetLang?: string }): Promise<{ audio: Buffer; mimeType: string }> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: this.cfg.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        pipelineId: this.cfg.pipelineId,
        userId: this.cfg.userId,
        task: "tts",
        targetLanguage: opts?.targetLang ?? "ta",
        text,
      }),
    });
    if (!res.ok) throw new Error(`bhashini TTS ${res.status}`);
    const data = (await res.json()) as { audioBase64?: string };
    if (!data.audioBase64) throw new Error("bhashini TTS: no audio returned");
    return { audio: Buffer.from(data.audioBase64, "base64"), mimeType: "audio/wav" };
  }
}

/** Try the primary provider; on error, fall back to the secondary. */
export class FallbackSpeechProvider implements SpeechProvider {
  readonly name: string;
  constructor(private primary: SpeechProvider, private fallback: SpeechProvider) {
    this.name = `${primary.name}->${fallback.name}`;
  }
  private async withFallback<T>(fn: (p: SpeechProvider) => Promise<T>): Promise<T> {
    try {
      return await fn(this.primary);
    } catch (err) {
      console.warn(`[speech] ${this.primary.name} failed, falling back to ${this.fallback.name}:`, err instanceof Error ? err.message : err);
      return fn(this.fallback);
    }
  }
  transcribe(audio: Buffer, opts?: { sourceLang?: string }) {
    return this.withFallback((p) => p.transcribe(audio, opts));
  }
  synthesize(text: string, opts?: { targetLang?: string }) {
    return this.withFallback((p) => p.synthesize(text, opts));
  }
}

export interface SpeechConfig {
  provider: "bhashini" | "sarvam";
  bhashini?: { apiKey: string; userId: string; pipelineId: string; inferenceUrl?: string };
  sarvam?: { apiKey: string };
}

/** Build the configured primary with the other as fallback. */
export function createSpeechProvider(cfg: SpeechConfig): SpeechProvider {
  const bhashini = cfg.bhashini ? new BhashiniSpeechProvider(cfg.bhashini) : null;
  const sarvam = cfg.sarvam ? new SarvamSpeechProvider(cfg.sarvam.apiKey) : null;

  const primary = cfg.provider === "bhashini" ? bhashini : sarvam;
  const fallback = cfg.provider === "bhashini" ? sarvam : bhashini;

  if (!primary) throw new Error(`Speech provider "${cfg.provider}" is not configured (missing keys)`);
  return fallback ? new FallbackSpeechProvider(primary, fallback) : primary;
}
