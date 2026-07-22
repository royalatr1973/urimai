/**
 * WhatsApp webhook server. GET verifies the Meta subscription handshake; POST validates the
 * signature, normalizes the inbound message, and hands it to the channel handler (which
 * reuses the Phase 3 orchestrator). Inbound processing is fire-and-forget so we ack Meta
 * fast and avoid delivery retries.
 */
import Fastify from "fastify";
import { getRedis } from "@urimai/cache";
import { listLatestSchemes, DbEscalationQueue } from "@urimai/db";
import { draftToDocx, draftToPdf } from "@urimai/docgen";
import { createDefaultLettersOrchestrator } from "@urimai/letters-orchestrator";
import { createDefaultOrchestrator } from "@urimai/orchestrator";
import { createMessageHandler } from "./handler.js";
import { createMadalHandler } from "./madal.js";
import { createAppRouter, type AppRouter } from "./router.js";
import { createSpeaker, createTranscriber } from "./voice.js";
import { createSpeechProvider, transcodeOggToWav, transcodeWavToOggOpus, type SpeechConfig } from "@urimai/speech";
import { MetaWhatsAppClient, parseInbound, verifyChallenge, verifySignature } from "@urimai/whatsapp-client";

const env = process.env;
const VERIFY_TOKEN = env.WHATSAPP_VERIFY_TOKEN ?? "";
const APP_SECRET = env.WHATSAPP_APP_SECRET ?? "";

function buildHandler(): { handler: AppRouter | null; reason?: string } {
  if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) {
    return { handler: null, reason: "WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN not set" };
  }
  const speechCfg: SpeechConfig = {
    provider: (env.SPEECH_PROVIDER as "bhashini" | "sarvam") ?? "bhashini",
    bhashini:
      env.BHASHINI_API_KEY && env.BHASHINI_USER_ID && env.BHASHINI_PIPELINE_ID
        ? { apiKey: env.BHASHINI_API_KEY, userId: env.BHASHINI_USER_ID, pipelineId: env.BHASHINI_PIPELINE_ID }
        : undefined,
    // Slower voice notes by default (live-tester request) — override via SPEECH_TTS_PACE.
    sarvam: env.SARVAM_API_KEY
      ? { apiKey: env.SARVAM_API_KEY, pace: Number(env.SPEECH_TTS_PACE ?? "0.85") }
      : undefined,
  };
  // Speech is optional: with no ASR/TTS keys the channel runs TEXT-ONLY (Tamil text replies,
  // "please type" nudge for voice notes) and upgrades to voice when keys are configured.
  let speech = null;
  try {
    speech = createSpeechProvider(speechCfg);
  } catch {
    console.warn("[whatsapp] no speech provider configured — running TEXT-ONLY until Bhashini/Sarvam keys are set");
  }
  try {
    const whatsapp = new MetaWhatsAppClient({ phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, accessToken: env.WHATSAPP_ACCESS_TOKEN });
    const escalation = new DbEscalationQueue(); // help tickets persist (encrypted) for the operator view
    const voice = { speech, whatsapp, transcode: transcodeOggToWav, transcodeOut: transcodeWavToOggOpus };
    const speak = createSpeaker(voice);

    // Urimai: the existing channel handler, reused unchanged (consent gate and all).
    // Short TTL: a shared phone serves many people, so a stale profile should age out
    // fast between beneficiaries (plus the explicit "new person" reset command).
    const urimai = createMessageHandler({
      orchestrator: createDefaultOrchestrator({ channel: "whatsapp", ttlSeconds: 30 * 60 }),
      speech,
      whatsapp,
      transcode: transcodeOggToWav,
      transcodeOut: transcodeWavToOggOpus,
      loadSchemes: () => listLatestSchemes(),
      escalation,
      helplineText: env.HELPLINE_TEXT,
    });

    // Madal: letters flow behind the SAME number (LETTERS_BRIEF §3). onComplete clears
    // the route so the next contact is greeted fresh (router assigned just below).
    let router: AppRouter;
    const madal = createMadalHandler({
      orchestrator: createDefaultLettersOrchestrator({ ttlSeconds: 30 * 60 }),
      whatsapp,
      speak,
      escalation,
      makePdf: (draft) => draftToPdf(draft),
      makeDocx: (draft) => draftToDocx(draft),
      onComplete: (from) => Promise.resolve(router.clearRoute(from)).then(() => undefined),
      helplineText: env.HELPLINE_TEXT,
    });

    const redis = getRedis();
    router = createAppRouter({
      routeStore: {
        get: (key) => redis.get(key),
        set: (key, value, mode, ttl) => redis.set(key, value, mode, ttl),
        del: (key) => redis.del(key),
      },
      toText: createTranscriber(voice),
      speak,
      urimai,
      madal,
      escalation,
      whatsapp,
      helplineText: env.HELPLINE_TEXT,
      ttlSeconds: 30 * 60,
      // Testing toggle: LETTERS_ONLY=true disables the schemes flow entirely.
      lettersOnly: env.LETTERS_ONLY === "true" || env.LETTERS_ONLY === "1",
    });
    if (env.LETTERS_ONLY === "true" || env.LETTERS_ONLY === "1") {
      app.log.warn("LETTERS_ONLY mode: schemes (Urimai) flow is DISABLED — every message drives the letters app.");
    }
    return { handler: router };
  } catch (e) {
    return { handler: null, reason: e instanceof Error ? e.message : String(e) };
  }
}

const app = Fastify({ logger: true });

// Keep the raw body so we can verify the HMAC signature over exact bytes.
app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  (req as unknown as { rawBody: string }).rawBody = body as string;
  try {
    done(null, body ? JSON.parse(body as string) : {});
  } catch (e) {
    done(e as Error);
  }
});

const { handler, reason } = buildHandler();
if (!handler) app.log.warn(`WhatsApp handler disabled: ${reason}. GET verify still works; POST will ack only.`);

app.get("/webhook", async (req, reply) => {
  const challenge = verifyChallenge(req.query as Record<string, unknown>, VERIFY_TOKEN);
  if (challenge === null) return reply.code(403).send("forbidden");
  return reply.code(200).send(challenge);
});

app.post("/webhook", async (req, reply) => {
  const raw = (req as unknown as { rawBody: string }).rawBody ?? "";
  if (APP_SECRET && !verifySignature(APP_SECRET, raw, req.headers["x-hub-signature-256"] as string | undefined)) {
    return reply.code(401).send("bad signature");
  }
  // Ack immediately; process async so Meta doesn't retry on slow ASR/LLM.
  reply.code(200).send("ok");

  const msg = parseInbound(req.body);
  if (msg && handler) {
    handler.handleInbound(msg).catch((e) => app.log.error({ err: e }, "handleInbound failed"));
  }
});

const port = Number(env.WHATSAPP_PORT ?? 3100);
const host = env.API_HOST ?? "0.0.0.0";
app
  .listen({ port, host })
  .then(() => app.log.info(`Urimai WhatsApp webhook on http://${host}:${port}/webhook`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
