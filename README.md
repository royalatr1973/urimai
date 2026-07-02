# Urimai

Helps Indian citizens discover and claim the government welfare schemes they're
entitled to. v1 covers four Tamil Nadu schemes. See [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md)
for the full brief and [`urimai-architecture.mermaid`](./urimai-architecture.mermaid)
for the architecture.

> **Status: Phase 0 (Scaffold) complete.** Later phases are not built yet.

## Non-negotiables baked into this scaffold

- **The LLM understands; it never decides.** Eligibility comes from a deterministic
  rules engine (Phase 1), never from Claude.
- **Thresholds are data, not code.** Income limits, age cutoffs and exclusions live in
  the `Scheme` table as versioned records — never hardcoded in business logic.
- **Seeded thresholds are UNVERIFIED placeholders.** Every seeded number is flagged and
  every scheme has `verified: false`. Do not trust them until a human confirms each GO.
- **No identity in discovery.** `Profile` carries no PII; identity is an apply-stage
  concern (Phase 6) only.

## Layout

```
urimai/
├─ packages/
│  ├─ types/   @urimai/types  — shared domain types (Profile, Scheme, Rule, Verdict)
│  ├─ db/      @urimai/db     — Prisma schema, client, seed, schemes:list
│  └─ cache/   @urimai/cache  — Redis wiring (session store, used from Phase 3)
└─ apps/
   └─ api/     @urimai/api    — Fastify gateway: /health and read-only /schemes
```

## Prerequisites

- Node ≥ 20 (you have v22)
- pnpm 9 — enable with `corepack enable pnpm`
- A reachable **PostgreSQL** and **Redis** (e.g. via Docker, see below)

```bash
# optional: local services
docker run -d --name urimai-pg  -e POSTGRES_USER=urimai -e POSTGRES_PASSWORD=urimai \
  -e POSTGRES_DB=urimai -p 5432:5432 postgres:16
docker run -d --name urimai-redis -p 6379:6379 redis:7
```

## Phase 0 — verify

```bash
cp .env.example .env          # adjust DATABASE_URL / REDIS_URL if needed
corepack enable pnpm
pnpm install
pnpm db:migrate               # creates the schema (prisma migrate dev)
pnpm seed                     # inserts the four schemes (all verified:false)
pnpm schemes:list             # prints them — proves they're queryable
```

Optional runnable slice:

```bash
pnpm api:dev
# GET http://localhost:3000/health   -> { status, checks: { postgres, redis } }
# GET http://localhost:3000/schemes  -> the four seeded schemes
```
