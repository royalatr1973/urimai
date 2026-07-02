# Urimai — Build Brief for Claude Code

> Drop this file into the repo root as `PROJECT_BRIEF.md`. Tell Claude Code to read it,
> then build **one phase at a time**, stopping after each phase so the acceptance checks
> can be verified before continuing. Do not attempt to build all phases in one pass.

---

## 1. What Urimai is

Urimai helps Indian citizens discover and claim the government welfare schemes they're
entitled to. The first version covers **four Tamil Nadu schemes** (old-age pension, destitute
widow pension, differently-abled pension, Kalaignar Magalir Urimai Thogai) and expands from there.

The hard truth about the users: **many cannot read, do not own the phone they're using, and are
wary of handing over identity documents.** The product must work for a non-literate woman speaking
into a shared smartphone, *and* for a literate operator (her son, an SHG leader, a CSC operator)
running it for many people. The same backend must serve both.

---

## 2. Non-negotiable principles

These are not preferences. Enforce them in the architecture; do not let any phase violate them.

1. **The LLM understands; it never decides.** Claude is used only to turn free text / transcribed
   speech into a structured profile. **Eligibility verdicts are produced by a deterministic rules
   engine — never by the LLM.** A verdict must be reproducible and explainable from the rules.
2. **Eligibility thresholds are data, never code.** Income limits, age cutoffs, exclusions live in
   the database as versioned rule records. Do **not** hardcode any legal threshold inside business
   logic. Every threshold value carries a `source` field and a `verified` flag.
3. **No identity in discovery.** The "what am I entitled to" flow must never ask for Aadhaar, never
   send an OTP to the beneficiary's number, and never assume the phone belongs to the beneficiary.
   Identity and any PII appear **only at the application step**, stored encrypted.
4. **Tamil-first, voice-first.** Tamil is the primary language end to end. On WhatsApp the entire
   interaction is voice notes; nothing on screen must be read to complete the flow.
5. **Channel-agnostic core.** The orchestrator and rules engine must not know which channel a
   request came from. Channels normalize input into one internal shape.
6. **Every decision is logged.** Each eligibility evaluation writes an immutable audit record
   (inputs, rule version, verdict, reasons).

---

## 3. Architecture (see `urimai-architecture.mermaid`)

- **Channel layer** — WhatsApp Business API (Meta Cloud API or a BSP), Web/PWA front end, IVR (phase 2).
- **Application core** — API gateway, conversation orchestrator (flow + gap logic), session manager.
- **Language & decision services** — Tamil ASR, Tamil TTS, LLM profile extractor (Claude), rules engine.
- **Data stores** — schemes/rules DB (Postgres, versioned), session cache (Redis), document image
  assets (object store/CDN), beneficiary records (encrypted, apply-stage only), audit log.
- **Human safety net** — escalation queue + operator/helpline. The phrase "help" always routes to a human.
- **Curation back office** — curator console + GO-ingestion (LLM-assisted) + human review → publishes rule versions.

---

## 4. Recommended stack

Pragmatic and India-appropriate; adjust only with reason.

- **Backend:** Node.js + TypeScript (Fastify). Monorepo (pnpm workspaces).
- **DB:** PostgreSQL via Prisma. **Cache/session:** Redis.
- **Frontend:** React + Vite, PWA, Tailwind. Tamil-first UI.
- **LLM extraction:** Anthropic SDK (`@anthropic-ai/sdk`), server-side only. Never expose the API key
  to the browser; the web app calls our backend, the backend calls Claude.
- **ASR/TTS (Tamil):** Bhashini APIs as primary; Sarvam AI as commercial fallback. Abstract both behind
  a `SpeechProvider` interface so either can be swapped. Note: WhatsApp voice notes arrive as OGG/Opus —
  transcode to the format ASR expects.
- **WhatsApp:** Meta WhatsApp Cloud API (webhook in, audio + image + text out).
- **Hosting:** an India region (data residency for welfare data). Object storage for document images + CDN.

---

## 5. Core data model

Generalize the prototype's rules shape. Keep it boring and explicit.

```ts
// A scheme's rules — the asset. Stored versioned in Postgres.
type Scheme = {
  id: string;
  name: string;              // English
  nameTamil: string;
  department: string;
  benefit: string;           // e.g. "₹1,000 / month"
  note: string;
  criteria: Rule[];          // ALL must pass to be eligible
  exclusions: Rule[];        // ANY true disqualifies
  documents: DocRef[];       // shown as pictures, walked through by voice
  applyAt: string;
  version: number;
  effectiveFrom: string;     // date the GO took effect
  source: string;            // GO number / URL
  verified: boolean;         // false until a human signs off
};

type Rule = {
  field: keyof Profile;
  op: "eq" | "gte" | "lte" | "gt" | "lt" | "true" | "false";
  value?: string | number | boolean;
  label: string;             // human-readable reason, used in voice + UI
  source?: string;           // GO citation for this specific threshold
};

type DocRef = {
  id: string;                // e.g. "ration_card"
  nameTamil: string;
  nameEnglish: string;
  imageAssetId: string;      // recognizable picture for the text-free card
  whereToGet: string;        // spoken if the user lacks it
};

// What we learn about the person. Discovery stage holds NO identity/PII.
type Profile = {
  age: number | null;
  gender: "male" | "female" | "other" | null;
  marital_status: "married" | "widowed" | "unmarried" | "divorced" | null;
  monthly_income: number | null;
  state: string | null;
  is_tamil_nadu: boolean | null;   // derived from state/district
  disability_percent: number | null;
  is_family_head: boolean | null;
  income_tax_payer: boolean | null;
  govt_employee: boolean | null;
  owns_four_wheeler: boolean | null;
  land_acres: number | null;
};

type Verdict = {
  schemeId: string;
  status: "eligible" | "need_info" | "not_eligible";
  reasons: string[];               // from Rule.label
  missingFields: (keyof Profile)[];// drives the next question
  ruleVersion: number;             // logged to audit
};
```

The rules engine is a **pure function** `evaluate(profile, scheme): Verdict` — no I/O, no LLM, fully unit-testable.

---

## 6. Build plan — one phase at a time

After each phase, stop and report what was built and how to verify it.

**Phase 0 — Scaffold.** Monorepo, TypeScript config, Prisma schema for the model above, Redis wiring,
`.env.example` for all secrets, seed the four schemes (mark every threshold `verified: false`).
*Accept:* `pnpm install && pnpm db:migrate && pnpm seed` runs clean; the four schemes are queryable.

**Phase 1 — Rules engine (the moat). Build this first and test it hardest.** Implement `evaluate()`
as a pure function. Handle: unknown field → contributes to `need_info` + `missingFields`; any exclusion
true → `not_eligible`; any criterion false → `not_eligible`; all known and passing → `eligible`.
*Accept:* a comprehensive unit test suite (edge cases: nulls, exclusion-vs-criterion precedence,
the widow/old-age double-eligibility case) passes. No LLM, no DB calls inside the function.

**Phase 2 — Profile extractor.** A server-side service that sends free text to Claude and returns a
validated `Profile`. Strict-JSON prompt, schema validation (zod), safe fallback to an empty profile on
parse failure. Derive `is_tamil_nadu` from `state`.
*Accept:* given sample Tamil + English situation strings, returns correct structured profiles; malformed
model output never crashes the service.

**Phase 3 — Conversation orchestrator (channel-agnostic).** Given a session + new user input, it: runs
extraction, merges into the stored profile, evaluates all schemes, and decides the next step — ask the
highest-value missing question, or deliver results. Session state in Redis. **No channel-specific code here.**
*Accept:* a scripted text simulation drives a full conversation to a correct verdict; gap questions are
asked only for fields that actually affect an in-scope scheme.

**Phase 4 — Web/PWA front end.** The Urimai checker (Tamil-first) calling the backend orchestrator.
Free-text box + editable fact fields + result cards with document checklists. This also serves operators.
*Accept:* a full discovery runs end to end in the browser against the real backend; no API key in client code.

**Phase 5 — WhatsApp voice channel.** Webhook receiver; download + transcode the OGG voice note; ASR →
orchestrator → TTS for questions and results; generate the **text-free document card image**; send voice +
image back. Implement the "help" → escalation handoff. Reuse the Phase 3 orchestrator unchanged.
*Accept:* a real WhatsApp number completes the voice flow described in the design and receives the document card.

**Phase 6 — Safety net, audit, apply stage.** Escalation queue + a minimal operator view of it; immutable
audit log on every evaluation; the apply-stage record (encrypted PII) — the only place identity is collected.
*Accept:* every evaluation appears in the audit log with rule version; PII is encrypted at rest; discovery
collects zero PII.

**Phase 7 — Curation back office (later).** Curator console + LLM-assisted GO ingestion that proposes rule
records for **human review and sign-off** before publishing a new scheme version. Nothing reaches the live
rules DB unreviewed.
*Accept:* a sample GO can be turned into a draft rule set, reviewed, and published as a new version; an
unreviewed draft is never used at runtime.

---

## 7. Working agreement for Claude Code

- Build and test **Phase 1 before anything else**; the deterministic engine is the product's spine.
- **Never** put eligibility logic or legal thresholds in code — they live in the rules DB as data.
- **Never** let the LLM output a verdict; it only produces a `Profile`.
- When seeding or ingesting a scheme, set `verified: false` and **flag every threshold for human
  verification against the current GO**. Do not invent threshold values; if unknown, leave a clearly
  marked placeholder and say so.
- Keep all secrets in env vars; the browser never holds the Anthropic key or talks to Claude directly.
- Produce a runnable slice at the end of each phase and a one-paragraph summary of what to verify.
- Ask before introducing a new external dependency or a new scheme's legal numbers.
