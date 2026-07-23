/**
 * API server entrypoint: binds the app to the real services (Postgres, Redis, Claude
 * extractor) and listens. All route logic lives in app.ts, which is dependency-injected
 * and tested in-process.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  getPrisma,
  listLatestSchemes,
  createBeneficiaryRecord,
  listAudit,
  listPendingEscalations,
  resolveEscalation,
  getAdminSummary,
  listAdminLetters,
  getAdminLetter,
} from "@urimai/db";
import { pingRedis } from "@urimai/cache";
import { draftToDocx, draftToPdf } from "@urimai/docgen";
import { sanitizeProfile } from "@urimai/extractor";
import { createDefaultOrchestrator } from "@urimai/orchestrator";
import type { LetterDraft } from "@urimai/types";
import { buildApp } from "./app.js";

/** The static admin page, loaded once at boot. Works under tsx (src) and compiled (dist). */
function loadAdminHtml(): string | undefined {
  for (const rel of ["../public/admin.html", "../../public/admin.html"]) {
    try {
      return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    } catch {
      /* try next candidate */
    }
  }
  return undefined;
}

const app = await buildApp({
  orchestrator: createDefaultOrchestrator({ channel: "web" }), // evaluations audited as "web"
  sanitizeProfile,
  listSchemes: () => listLatestSchemes(),
  createBeneficiaryRecord,
  listAudit: (sessionId) => listAudit(sessionId),
  listPendingEscalations,
  resolveEscalation,
  checkPostgres: async () => {
    await getPrisma().$queryRaw`SELECT 1`;
    return true;
  },
  checkRedis: () => pingRedis(),
  operatorToken: process.env.OPERATOR_TOKEN,
  adminSummary: () => getAdminSummary(),
  listAdminLetters: (opts) => listAdminLetters(opts),
  getAdminLetter: (sessionId) => getAdminLetter(sessionId),
  renderLetterPdf: (draft) => draftToPdf(draft as LetterDraft),
  renderLetterDocx: (draft) => draftToDocx(draft as LetterDraft),
  logAdminView: async (sessionId) => {
    // Letter content is PII; record every open. Server-log for now (a dedicated
    // admin-audit table can come later) — the point is the access leaves a trail.
    console.info(JSON.stringify({ evt: "admin_letter_view", sessionId, at: new Date().toISOString() }));
  },
  adminHtml: loadAdminHtml(),
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
