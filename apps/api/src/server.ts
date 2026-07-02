/**
 * API server entrypoint: binds the app to the real services (Postgres, Redis, Claude
 * extractor) and listens. All route logic lives in app.ts, which is dependency-injected
 * and tested in-process.
 */
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
import { buildApp } from "./app.js";

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
