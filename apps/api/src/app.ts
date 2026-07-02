/**
 * Urimai API gateway — app construction, dependency-injected so the HTTP surface is
 * testable in-process (fastify.inject) without Postgres/Redis/Claude.
 *
 * The browser NEVER holds the Anthropic key or the rules engine: the client sends text
 * (or an edited profile) and gets verdicts back. Both the Claude call and the engine run
 * server-side, behind these routes.
 *
 * Security posture:
 *  - /api/assess and /api/reassess are rate-limited (assess triggers a paid LLM call).
 *  - /api/operator/* decrypts PII, so it REQUIRES a bearer token (OPERATOR_TOKEN). If no
 *    token is configured, those routes fail closed with 503 rather than serving openly.
 */
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import crypto from "node:crypto";
import type { Profile, Scheme } from "@urimai/types";
import type { Assessment } from "@urimai/orchestrator";

export interface ApiDeps {
  orchestrator: {
    assess(sessionId: string, text: string): Promise<Assessment>;
    reassess(sessionId: string, profile: Profile): Promise<Assessment>;
  };
  sanitizeProfile(input: unknown): Profile;
  listSchemes(): Promise<Scheme[]>;
  createBeneficiaryRecord(input: { sessionId: string; schemeId: string; pii: Record<string, unknown> }): Promise<{ id: string }>;
  listAudit(sessionId?: string): Promise<unknown>;
  listPendingEscalations(): Promise<unknown>;
  resolveEscalation(id: string): Promise<void>;
  checkPostgres(): Promise<boolean>;
  checkRedis(): Promise<boolean>;
  /** Bearer token for /api/operator/* (decrypts PII). Unset → those routes return 503. */
  operatorToken?: string;
  /** Per-minute rate limits (defaults: assess 20, reassess 60). */
  rateLimits?: { assessPerMinute?: number; reassessPerMinute?: number };
  logger?: boolean;
}

function timingSafeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export async function buildApp(deps: ApiDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? true, bodyLimit: 256 * 1024 });

  await app.register(rateLimit, { global: false });
  const assessLimit = { max: deps.rateLimits?.assessPerMinute ?? 20, timeWindow: "1 minute" };
  const reassessLimit = { max: deps.rateLimits?.reassessPerMinute ?? 60, timeWindow: "1 minute" };

  /** Guard for operator routes: bearer token, fail closed when unconfigured. */
  const requireOperator = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!deps.operatorToken) {
      reply.code(503).send({ error: "operator access not configured (set OPERATOR_TOKEN)" });
      return reply;
    }
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token || !timingSafeEquals(token, deps.operatorToken)) {
      reply.code(401).send({ error: "unauthorized" });
      return reply;
    }
  };

  app.get("/health", async () => {
    const checks: Record<string, "ok" | "down"> = { api: "ok", postgres: "down", redis: "down" };
    try {
      if (await deps.checkPostgres()) checks.postgres = "ok";
    } catch {
      /* down */
    }
    try {
      if (await deps.checkRedis()) checks.redis = "ok";
    } catch {
      /* down */
    }
    const healthy = Object.values(checks).every((v) => v === "ok");
    return { status: healthy ? "ok" : "degraded", checks };
  });

  app.get("/api/schemes", async () => {
    const schemes = await deps.listSchemes();
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

  app.post("/api/assess", { config: { rateLimit: assessLimit } }, async (req, reply) => {
    const body = (req.body ?? {}) as { sessionId?: unknown; text?: unknown };
    if (typeof body.sessionId !== "string" || typeof body.text !== "string") {
      reply.code(400);
      return { error: "sessionId (string) and text (string) are required" };
    }
    return deps.orchestrator.assess(body.sessionId, body.text);
  });

  app.post("/api/reassess", { config: { rateLimit: reassessLimit } }, async (req, reply) => {
    const body = (req.body ?? {}) as { sessionId?: unknown; profile?: unknown };
    if (typeof body.sessionId !== "string") {
      reply.code(400);
      return { error: "sessionId (string) is required" };
    }
    const profile = deps.sanitizeProfile(body.profile); // validates types server-side; never throws
    return deps.orchestrator.reassess(body.sessionId, profile);
  });

  // --- Apply stage: the ONLY place identity/PII is collected; stored encrypted at rest. ---
  app.post("/api/apply", { config: { rateLimit: assessLimit } }, async (req, reply) => {
    const body = (req.body ?? {}) as { sessionId?: unknown; schemeId?: unknown; pii?: unknown };
    if (typeof body.sessionId !== "string" || typeof body.schemeId !== "string" || !body.pii || typeof body.pii !== "object") {
      reply.code(400);
      return { error: "sessionId, schemeId, and pii (object) are required" };
    }
    return deps.createBeneficiaryRecord({
      sessionId: body.sessionId,
      schemeId: body.schemeId,
      pii: body.pii as Record<string, unknown>,
    });
  });

  // --- Operator routes (decrypt PII) — bearer-token protected, fail closed. ---
  app.get("/api/operator/escalations", { preHandler: requireOperator }, async () => {
    return { escalations: await deps.listPendingEscalations() };
  });

  app.post("/api/operator/escalations/:id/resolve", { preHandler: requireOperator }, async (req) => {
    await deps.resolveEscalation((req.params as { id: string }).id);
    return { ok: true };
  });

  app.get("/api/operator/audit", { preHandler: requireOperator }, async (req) => {
    const sessionId = (req.query as { sessionId?: string }).sessionId;
    return { audit: await deps.listAudit(sessionId) };
  });

  return app;
}
