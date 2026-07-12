/**
 * WhatsApp webhook server. GET verifies the Meta subscription handshake; POST validates the
 * signature, normalizes the inbound message, and hands it to the channel handler (which
 * reuses the Phase 3 orchestrator). Inbound processing is fire-and-forget so we ack Meta
 * fast and avoid delivery retries.
 */
import Fastify from "fastify";
import { listLatestSchemes, DbEscalationQueue } from "@urimai/db";
import { createDefaultOrchestrator } from "@urimai/orchestrator";
import { createMessageHandler, type MessageHandler } from "./handler.js";
import { createSpeechProvider, type SpeechConfig } from "./speech.js";
import { transcodeOggToWav, transcodeWavToOggOpus } from "./transcode.js";
import { MetaWhatsAppClient, parseInbound, verifyChallenge, verifySignature } from "./whatsapp.js";

const env = process.env;
const VERIFY_TOKEN = env.WHATSAPP_VERIFY_TOKEN ?? "";
const APP_SECRET = env.WHATSAPP_APP_SECRET ?? "";

function buildHandler(): { handler: MessageHandler | null; reason?: string } {
  if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) {
    return { handler: null, reason: "WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN not set" };
  }
  const speechCfg: SpeechConfig = {
    provider: (env.SPEECH_PROVIDER as "bhashini" | "sarvam") ?? "bhashini",
    bhashini:
      env.BHASHINI_API_KEY && env.BHASHINI_USER_ID && env.BHASHINI_PIPELINE_ID
        ? { apiKey: env.BHASHINI_API_KEY, userId: env.BHASHINI_USER_ID, pipelineId: env.BHASHINI_PIPELINE_ID }
        : undefined,
    sarvam: env.SARVAM_API_KEY ? { apiKey: env.SARVAM_API_KEY } : undefined,
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
    const handler = createMessageHandler({
      // Short TTL: a shared phone serves many people, so a stale profile should age out
      // fast between beneficiaries (plus the explicit "new person" reset command).
      orchestrator: createDefaultOrchestrator({ channel: "whatsapp", ttlSeconds: 30 * 60 }),
      speech,
      whatsapp: new MetaWhatsAppClient({ phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, accessToken: env.WHATSAPP_ACCESS_TOKEN }),
      transcode: transcodeOggToWav,
      transcodeOut: transcodeWavToOggOpus,
      loadSchemes: () => listLatestSchemes(),
      escalation: new DbEscalationQueue(), // help tickets persist (encrypted) for the operator view
      helplineText: env.HELPLINE_TEXT,
    });
    return { handler };
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
