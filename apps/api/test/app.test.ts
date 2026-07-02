import { describe, it, expect, vi } from "vitest";
import { EMPTY_PROFILE, type Profile } from "@urimai/types";
import { buildApp, type ApiDeps } from "../src/app.js";

function fakeDeps(over: Partial<ApiDeps> = {}): ApiDeps {
  return {
    orchestrator: {
      assess: vi.fn(async () => ({ profile: EMPTY_PROFILE, verdicts: [] })),
      reassess: vi.fn(async (_s: string, profile: Profile) => ({ profile, verdicts: [] })),
    },
    sanitizeProfile: () => ({ ...EMPTY_PROFILE }),
    listSchemes: async () => [],
    createBeneficiaryRecord: vi.fn(async () => ({ id: "ben1" })),
    listAudit: async () => [],
    listPendingEscalations: async () => [{ id: "e1", from: "9199", text: "help", reason: "help_requested" }],
    resolveEscalation: vi.fn(async () => {}),
    checkPostgres: async () => true,
    checkRedis: async () => true,
    operatorToken: "secret-token",
    logger: false,
    ...over,
  };
}

describe("validation", () => {
  it("assess 400s without sessionId/text; 200s with them", async () => {
    const app = await buildApp(fakeDeps());
    expect((await app.inject({ method: "POST", url: "/api/assess", payload: {} })).statusCode).toBe(400);
    const ok = await app.inject({ method: "POST", url: "/api/assess", payload: { sessionId: "s", text: "t" } });
    expect(ok.statusCode).toBe(200);
  });

  it("apply 400s without pii object", async () => {
    const app = await buildApp(fakeDeps());
    const r = await app.inject({ method: "POST", url: "/api/apply", payload: { sessionId: "s", schemeId: "widow" } });
    expect(r.statusCode).toBe(400);
  });

  it("health reflects failing dependencies as degraded", async () => {
    const app = await buildApp(fakeDeps({ checkRedis: async () => false }));
    const r = await app.inject({ method: "GET", url: "/health" });
    expect(r.json()).toMatchObject({ status: "degraded", checks: { redis: "down", postgres: "ok" } });
  });
});

describe("operator auth (routes that decrypt PII)", () => {
  it("rejects missing and wrong bearer tokens with 401", async () => {
    const app = await buildApp(fakeDeps());
    expect((await app.inject({ method: "GET", url: "/api/operator/escalations" })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: "GET", url: "/api/operator/escalations", headers: { authorization: "Bearer wrong" } })).statusCode,
    ).toBe(401);
  });

  it("accepts the correct token", async () => {
    const app = await buildApp(fakeDeps());
    const r = await app.inject({ method: "GET", url: "/api/operator/escalations", headers: { authorization: "Bearer secret-token" } });
    expect(r.statusCode).toBe(200);
    expect(r.json().escalations).toHaveLength(1);
  });

  it("fails CLOSED (503) when no operator token is configured", async () => {
    const app = await buildApp(fakeDeps({ operatorToken: undefined }));
    const r = await app.inject({ method: "GET", url: "/api/operator/audit" });
    expect(r.statusCode).toBe(503);
  });

  it("guards all three operator routes", async () => {
    const app = await buildApp(fakeDeps());
    for (const [method, url] of [
      ["GET", "/api/operator/escalations"],
      ["POST", "/api/operator/escalations/e1/resolve"],
      ["GET", "/api/operator/audit"],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(401);
    }
  });
});

describe("rate limiting", () => {
  it("429s /api/assess past the per-minute limit (LLM cost protection)", async () => {
    const app = await buildApp(fakeDeps({ rateLimits: { assessPerMinute: 2 } }));
    const fire = () => app.inject({ method: "POST", url: "/api/assess", payload: { sessionId: "s", text: "t" } });
    expect((await fire()).statusCode).toBe(200);
    expect((await fire()).statusCode).toBe(200);
    expect((await fire()).statusCode).toBe(429);
  });

  it("does not rate-limit /health", async () => {
    const app = await buildApp(fakeDeps({ rateLimits: { assessPerMinute: 1 } }));
    for (let i = 0; i < 5; i++) {
      expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    }
  });
});
