/**
 * Tamil ASR/TTS behind one swappable interface, so either backend can be replaced and a
 * primary can fall back to a secondary. Bhashini is primary (govt, free), Sarvam is the
 * commercial fallback. (PROJECT_BRIEF.md §4.)
 *
 * HTTP shapes verified against live docs, July 2026:
 *  - Sarvam:   docs.sarvam.ai — POST /speech-to-text (multipart, saarika:v2.5, header
 *              api-subscription-key, → {transcript}); POST /text-to-speech (JSON {text,
 *              target_language_code, model:"bulbul:v2", speaker, output_audio_codec},
 *              → {audios:[base64]}). TTS text limit 1500 chars (bulbul:v2).
 *  - Bhashini: bhashini.gitbook.io — TWO-step. (1) config: POST meity-auth.ulcacontrib.org
 *              /ulca/apis/v0/model/getModelsPipeline with headers userID + ulcaApiKey →
 *              pipelineInferenceAPIEndPoint{callbackUrl, inferenceApiKey{name,value}} +
 *              per-task serviceId. (2) compute: POST callbackUrl with that auth header,
 *              pipelineTasks[{taskType, config{language, serviceId, ...}}] + inputData.
 *              ASR transcript at pipelineResponse[0].output[0].source; TTS audio at
 *              pipelineResponse[0].audio[0].audioContent (base64 WAV).
 */

export interface SpeechProvider {
  readonly name: string;
  /** Tamil speech → text. `audio` is WAV/PCM (16k mono) after transcode. */
  transcribe(audio: Buffer, opts?: { sourceLang?: string }): Promise<string>;
  /** Tamil text → speech. Returns audio bytes + mime type. */
  synthesize(text: string, opts?: { targetLang?: string }): Promise<{ audio: Buffer; mimeType: string }>;
}

const TA_BCP47 = "ta-IN"; // Sarvam wants BCP-47
const TA_ISO = "ta"; // Bhashini wants ISO-639

// --- Sarvam (commercial) ------------------------------------------------------
export class SarvamSpeechProvider implements SpeechProvider {
  readonly name = "sarvam";
  constructor(private apiKey: string, private base = "https://api.sarvam.ai") {}

  async transcribe(audio: Buffer, opts?: { sourceLang?: string }): Promise<string> {
    // Hand-rolled multipart with an explicit Content-Length: Node fetch's FormData uses
    // chunked transfer-encoding, which Sarvam's edge rejects with a MISLEADING 402
    // "No credits available" (verified July 2026 — identical bytes via curl succeed).
    const boundary = `----urimai${Date.now().toString(16)}`;
    const enc = (s: string) => Buffer.from(s, "utf8");
    const field = (name: string, value: string) =>
      enc(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    const body = Buffer.concat([
      enc(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`),
      audio,
      enc(`\r\n`),
      field("model", "saarika:v2.5"),
      field("language_code", opts?.sourceLang ?? TA_BCP47),
      enc(`--${boundary}--\r\n`),
    ]);
    const res = await fetch(`${this.base}/speech-to-text`, {
      method: "POST",
      headers: {
        "api-subscription-key": this.apiKey,
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": String(body.length),
      },
      body,
    });
    if (!res.ok) throw new Error(`sarvam STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { transcript?: string };
    return data.transcript ?? "";
  }

  async synthesize(text: string, opts?: { targetLang?: string }): Promise<{ audio: Buffer; mimeType: string }> {
    // bulbul:v2 hard limit is 1500 chars; stay under it. Long replies should be rare —
    // the one-question loop keeps turns short — but a truncated verdict is worse than a
    // slightly clipped sentence, so cut at a sentence boundary where possible.
    const MAX = 1400;
    let t = text;
    if (t.length > MAX) {
      const cut = t.lastIndexOf("।", MAX) > 0 ? t.lastIndexOf("।", MAX) : t.lastIndexOf(".", MAX);
      t = t.slice(0, cut > MAX / 2 ? cut + 1 : MAX);
    }
    const res = await fetch(`${this.base}/text-to-speech`, {
      method: "POST",
      headers: { "api-subscription-key": this.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        text: t,
        target_language_code: opts?.targetLang ?? TA_BCP47,
        model: "bulbul:v2",
        speaker: "anushka",
        // MP3 out: WhatsApp's media API accepts audio/mpeg but NOT audio/wav.
        output_audio_codec: "mp3",
        speech_sample_rate: 22050,
      }),
    });
    if (!res.ok) throw new Error(`sarvam TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { audios?: string[] };
    const b64 = data.audios?.[0];
    if (!b64) throw new Error("sarvam TTS: no audio returned");
    return { audio: Buffer.from(b64, "base64"), mimeType: "audio/mpeg" };
  }
}

// --- Bhashini (govt) -----------------------------------------------------------
interface BhashiniPipelineConfig {
  callbackUrl: string;
  authHeaderName: string;
  authHeaderValue: string;
  asrServiceId: string;
  ttsServiceId: string;
}

export class BhashiniSpeechProvider implements SpeechProvider {
  readonly name = "bhashini";
  private pipeline: Promise<BhashiniPipelineConfig> | null = null;

  constructor(
    private cfg: { apiKey: string; userId: string; pipelineId: string; configUrl?: string },
  ) {}

  /** Step 1 (cached for process lifetime): resolve inference endpoint, auth, serviceIds. */
  private getPipeline(): Promise<BhashiniPipelineConfig> {
    if (!this.pipeline) this.pipeline = this.fetchPipeline();
    return this.pipeline;
  }

  private async fetchPipeline(): Promise<BhashiniPipelineConfig> {
    const url = this.cfg.configUrl ?? "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline";
    const res = await fetch(url, {
      method: "POST",
      headers: { userID: this.cfg.userId, ulcaApiKey: this.cfg.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        pipelineTasks: [
          { taskType: "asr", config: { language: { sourceLanguage: TA_ISO } } },
          { taskType: "tts", config: { language: { sourceLanguage: TA_ISO } } },
        ],
        pipelineRequestConfig: { pipelineId: this.cfg.pipelineId },
      }),
    });
    if (!res.ok) {
      this.pipeline = null; // allow retry on next call
      throw new Error(`bhashini config ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      pipelineInferenceAPIEndPoint?: { callbackUrl?: string; inferenceApiKey?: { name?: string; value?: string } };
      pipelineResponseConfig?: Array<{ taskType?: string; config?: Array<{ serviceId?: string }> }>;
    };
    const ep = data.pipelineInferenceAPIEndPoint;
    const svc = (task: string) =>
      data.pipelineResponseConfig?.find((c) => c.taskType === task)?.config?.[0]?.serviceId ?? "";
    const out: BhashiniPipelineConfig = {
      callbackUrl: ep?.callbackUrl ?? "https://dhruva-api.bhashini.gov.in/services/inference/pipeline",
      authHeaderName: ep?.inferenceApiKey?.name ?? "Authorization",
      authHeaderValue: ep?.inferenceApiKey?.value ?? "",
      asrServiceId: svc("asr"),
      ttsServiceId: svc("tts"),
    };
    if (!out.authHeaderValue || !out.asrServiceId || !out.ttsServiceId) {
      this.pipeline = null;
      throw new Error("bhashini config: missing inference key or serviceIds in response");
    }
    return out;
  }

  /** Step 2: compute call against the resolved endpoint. */
  private async compute(body: unknown): Promise<any> {
    const p = await this.getPipeline();
    const res = await fetch(p.callbackUrl, {
      method: "POST",
      headers: { [p.authHeaderName]: p.authHeaderValue, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) this.pipeline = null; // key rotated → re-config next call
    if (!res.ok) throw new Error(`bhashini compute ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }

  async transcribe(audio: Buffer, opts?: { sourceLang?: string }): Promise<string> {
    const p = await this.getPipeline();
    const data = await this.compute({
      pipelineTasks: [
        {
          taskType: "asr",
          config: {
            language: { sourceLanguage: opts?.sourceLang?.slice(0, 2) ?? TA_ISO },
            serviceId: p.asrServiceId,
            audioFormat: "wav",
            samplingRate: 16000,
          },
        },
      ],
      inputData: { audio: [{ audioContent: audio.toString("base64") }] },
    });
    return data?.pipelineResponse?.[0]?.output?.[0]?.source ?? "";
  }

  async synthesize(text: string, opts?: { targetLang?: string }): Promise<{ audio: Buffer; mimeType: string }> {
    const p = await this.getPipeline();
    const data = await this.compute({
      pipelineTasks: [
        {
          taskType: "tts",
          config: {
            language: { sourceLanguage: opts?.targetLang?.slice(0, 2) ?? TA_ISO },
            serviceId: p.ttsServiceId,
            gender: "female",
            samplingRate: 16000,
          },
        },
      ],
      inputData: { input: [{ source: text }] },
    });
    const b64 = data?.pipelineResponse?.[0]?.audio?.[0]?.audioContent;
    if (!b64) throw new Error("bhashini TTS: no audio returned");
    // Bhashini returns WAV — the handler transcodes to OGG/Opus before WhatsApp (which
    // rejects audio/wav uploads).
    return { audio: Buffer.from(b64, "base64"), mimeType: "audio/wav" };
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
  bhashini?: { apiKey: string; userId: string; pipelineId: string; configUrl?: string };
  sarvam?: { apiKey: string };
}

/**
 * Build the configured primary with the other as fallback. If the REQUESTED primary has no
 * keys but the other provider does, use what exists — a half-configured .env should still
 * give citizens voice, not silently fall back to text-only.
 */
export function createSpeechProvider(cfg: SpeechConfig): SpeechProvider {
  const bhashini = cfg.bhashini ? new BhashiniSpeechProvider(cfg.bhashini) : null;
  const sarvam = cfg.sarvam ? new SarvamSpeechProvider(cfg.sarvam.apiKey) : null;

  let primary = cfg.provider === "bhashini" ? bhashini : sarvam;
  let fallback = cfg.provider === "bhashini" ? sarvam : bhashini;
  if (!primary && fallback) {
    console.warn(`[speech] "${cfg.provider}" not configured — using ${fallback.name} as primary`);
    primary = fallback;
    fallback = null;
  }

  if (!primary) throw new Error(`Speech provider "${cfg.provider}" is not configured (missing keys)`);
  return fallback ? new FallbackSpeechProvider(primary, fallback) : primary;
}
