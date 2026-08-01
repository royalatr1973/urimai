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
  // --- Admin portal (operator-token gated) ---
  adminSummary(): Promise<unknown>;
  listAdminLetters(opts: { limit?: number; offset?: number }): Promise<unknown>;
  getAdminLetter(letterId: string): Promise<{ draft: unknown } | null>;
  /** Render a stored draft to document bytes (Puppeteer/docx) for download. */
  renderLetterPdf(draft: unknown): Promise<Buffer>;
  renderLetterDocx(draft: unknown): Promise<Buffer>;
  /** Record that an admin opened a specific letter (letter content is PII). */
  logAdminView(sessionId: string): Promise<void>;
  // --- Per-phone daily-limit allowlist (operator-managed) ---
  listPhoneLimits(): Promise<Array<{ phone: string; dailyLimit: number; label: string | null; updatedAt: Date }>>;
  setPhoneLimit(input: { phone: string; dailyLimit: number; label?: string | null }): Promise<{ phone: string; dailyLimit: number; label: string | null }>;
  deletePhoneLimit(phone: string): Promise<void>;
  /** The static admin page HTML, served at GET /admin. Unset → 404. */
  adminHtml?: string;
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

  // --- Admin portal --------------------------------------------------------
  // The page shell (GET /admin) is served without a token — it only prompts for one;
  // every data route below is operator-gated, so nothing sensitive leaks from the shell.
  app.get("/admin", async (_req, reply) => {
    if (!deps.adminHtml) {
      reply.code(404).send("admin portal not built");
      return reply;
    }
    reply.type("text/html").send(deps.adminHtml);
    return reply;
  });

  app.get("/api/admin/summary", { preHandler: requireOperator }, async () => {
    return deps.adminSummary();
  });

  app.get("/api/admin/letters", { preHandler: requireOperator }, async (req) => {
    const q = req.query as { limit?: string; offset?: string };
    const limit = q.limit ? Number(q.limit) : undefined;
    const offset = q.offset ? Number(q.offset) : undefined;
    return deps.listAdminLetters({
      limit: Number.isFinite(limit) ? limit : undefined,
      offset: Number.isFinite(offset) ? offset : undefined,
    });
  });

  app.get("/api/admin/letters/:letterId", { preHandler: requireOperator }, async (req, reply) => {
    const letterId = (req.params as { letterId: string }).letterId;
    const letter = await deps.getAdminLetter(letterId);
    if (!letter) {
      reply.code(404).send({ error: "letter not found" });
      return reply;
    }
    await deps.logAdminView(letterId); // opening letter content is a logged action
    return letter;
  });

  const sendDoc = async (
    reply: FastifyReply,
    letterId: string,
    kind: "pdf" | "docx",
    render: (draft: unknown) => Promise<Buffer>,
    mime: string,
  ) => {
    const letter = await deps.getAdminLetter(letterId);
    if (!letter?.draft) {
      reply.code(404).send({ error: "letter not found" });
      return reply;
    }
    await deps.logAdminView(letterId);
    const bytes = await render(letter.draft);
    reply
      .type(mime)
      .header("content-disposition", `inline; filename="madal-${kind}.${kind}"`)
      .send(bytes);
    return reply;
  };

  // Per-phone daily-limit allowlist: list / upsert / remove. All operator-gated.
  app.get("/api/admin/phone-limits", { preHandler: requireOperator }, async () => {
    return { limits: await deps.listPhoneLimits() };
  });

  app.put("/api/admin/phone-limits", { preHandler: requireOperator }, async (req, reply) => {
    const body = (req.body ?? {}) as { phone?: unknown; dailyLimit?: unknown; label?: unknown };
    if (typeof body.phone !== "string" || typeof body.dailyLimit !== "number") {
      reply.code(400).send({ error: "phone (string) and dailyLimit (number) are required" });
      return reply;
    }
    try {
      return { limit: await deps.setPhoneLimit({ phone: body.phone, dailyLimit: body.dailyLimit, label: typeof body.label === "string" ? body.label : null }) };
    } catch (e) {
      reply.code(400).send({ error: e instanceof Error ? e.message : "invalid input" });
      return reply;
    }
  });

  app.delete("/api/admin/phone-limits/:phone", { preHandler: requireOperator }, async (req) => {
    await deps.deletePhoneLimit((req.params as { phone: string }).phone);
    return { ok: true };
  });

  app.get("/api/admin/letters/:letterId/pdf", { preHandler: requireOperator }, async (req, reply) =>
    sendDoc(reply, (req.params as { letterId: string }).letterId, "pdf", deps.renderLetterPdf, "application/pdf"),
  );
  app.get("/api/admin/letters/:letterId/docx", { preHandler: requireOperator }, async (req, reply) =>
    sendDoc(
      reply,
      (req.params as { letterId: string }).letterId,
      "docx",
      deps.renderLetterDocx,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
  );

  return app;
}
