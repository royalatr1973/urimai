/**
 * Urimai API gateway.
 *
 * The web channel's backend. The browser NEVER holds the Anthropic key or the rules engine:
 * the client sends text (or an edited profile) and gets verdicts back. Both the Claude call
 * (in the extractor) and the rules engine run here, server-side.
 *
 *   GET  /health        -> liveness + Postgres/Redis connectivity
 *   GET  /api/schemes    -> scheme metadata for rendering result cards (no thresholds needed by client)
 *   POST /api/assess     -> { sessionId, text }    -> { profile, verdicts }  (extract once + evaluate)
 *   POST /api/reassess   -> { sessionId, profile }  -> { profile, verdicts }  (re-evaluate edits; no LLM)
 */
import Fastify from "fastify";
import {
  getPrisma,
  listLatestSchemes,
  createBeneficiaryRecord,
  listAudit,
  listPendingEscalations,
  resolveEscalation,
} from "@urimai/db";
import { pingRedis } from "@urimai/cache";
import { sanitizeProfile } from "@urimai/extractor";
import { createDefaultOrchestrator } from "@urimai/orchestrator";

const app = Fastify({ logger: true, bodyLimit: 256 * 1024 });
const orchestrator = createDefaultOrchestrator({ channel: "web" }); // evaluations audited as "web"

app.get("/health", async () => {
  const checks: Record<string, "ok" | "down"> = { api: "ok", postgres: "down", redis: "down" };
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    checks.postgres = "ok";
  } catch {
    /* down */
  }
  try {
    if (await pingRedis()) checks.redis = "ok";
  } catch {
    /* down */
  }
  const healthy = Object.values(checks).every((v) => v === "ok");
  return { status: healthy ? "ok" : "degraded", checks };
});

app.get("/api/schemes", async () => {
  const schemes = await listLatestSchemes();
  // The client only needs display metadata — not the thresholds/rule logic.
  return {
    schemes: schemes.map((s) => ({
      id: s.id,
      name: s.name,
      nameTamil: s.nameTamil,
      benefit: s.benefit,
      department: s.department,
      applyAt: s.applyAt,
      documents: s.documents,
      verified: s.verified,
    })),
  };
});

app.post("/api/assess", async (req, reply) => {
  const body = (req.body ?? {}) as { sessionId?: unknown; text?: unknown };
  if (typeof body.sessionId !== "string" || typeof body.text !== "string") {
    reply.code(400);
    return { error: "sessionId (string) and text (string) are required" };
  }
  return orchestrator.assess(body.sessionId, body.text);
});

app.post("/api/reassess", async (req, reply) => {
  const body = (req.body ?? {}) as { sessionId?: unknown; profile?: unknown };
  if (typeof body.sessionId !== "string") {
    reply.code(400);
    return { error: "sessionId (string) is required" };
  }
  const profile = sanitizeProfile(body.profile); // validates types server-side; never throws
  return orchestrator.reassess(body.sessionId, profile);
});

// --- Apply stage: the ONLY place identity/PII is collected; stored encrypted at rest. ---
app.post("/api/apply", async (req, reply) => {
  const body = (req.body ?? {}) as { sessionId?: unknown; schemeId?: unknown; pii?: unknown };
  if (typeof body.sessionId !== "string" || typeof body.schemeId !== "string" || !body.pii || typeof body.pii !== "object") {
    reply.code(400);
    return { error: "sessionId, schemeId, and pii (object) are required" };
  }
  const { id } = await createBeneficiaryRecord({
    sessionId: body.sessionId,
    schemeId: body.schemeId,
    pii: body.pii as Record<string, unknown>,
  });
  return { id };
});

// --- Operator view of the escalation queue (minimal). ---
app.get("/api/operator/escalations", async () => {
  return { escalations: await listPendingEscalations() };
});

app.post("/api/operator/escalations/:id/resolve", async (req) => {
  await resolveEscalation((req.params as { id: string }).id);
  return { ok: true };
});

// --- Audit read (for verification / an operator timeline). ---
app.get("/api/operator/audit", async (req) => {
  const sessionId = (req.query as { sessionId?: string }).sessionId;
  return { audit: await listAudit(sessionId) };
});

const port = Number(process.env.API_PORT ?? 3000);
const host = process.env.API_HOST ?? "0.0.0.0";

app
  .listen({ port, host })
  .then(() => app.log.info(`Urimai API listening on http://${host}:${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
