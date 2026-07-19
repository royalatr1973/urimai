# Madal — Letters Build Brief for Claude Code

> Companion to `PROJECT_BRIEF.md`. Read that first for the Urimai context, then build this
> **one phase at a time**, stopping after each phase for acceptance checks. Do not build
> all phases in one pass. "Madal" (மடல், letter) is a working name; rename is cosmetic.

---

## 1. What Madal is

Madal helps a citizen — literate or not — produce a formal application, complaint, petition,
or request letter by **talking**. The user speaks their situation as WhatsApp voice notes in
Tamil; Madal asks clarifying questions by voice, drafts the letter, **reads it back aloud for
correction and approval**, and only then delivers the final letter as **PDF and Word (.docx)**
documents on WhatsApp, ready to print or forward.

The letter type is **not chosen from a fixed menu** — it is inferred from what the user needs.
A seed set of common types (RTI request, police complaint, municipal/civic grievance,
pension/scheme grievance, wage complaint, transfer/leave application) provides structure, and a
**generic petition** type is the universal fallback so no user is ever turned away.

Same user reality as Urimai: may not read, may not own the phone, wary of documents. Same
backend must also serve a literate operator typing on the web.

---

## 2. Non-negotiable principles

Urimai's principles carry over with **one deliberate change** — here the LLM *does* write the
output. The safety model shifts accordingly:

1. **The LLM drafts; the user decides.** No letter is finalized without the user hearing the
   full text read back (voice) or seeing it (web) and giving **explicit approval**. Corrections
   loop until approval. The approval utterance is logged.
2. **The LLM never invents facts.** Names, dates, amounts, addresses, incident details come
   only from what the user said. If a required fact is missing, ask — never fabricate. If the
   user doesn't know it, the letter omits it or marks a blank to fill by hand. **No invented
   legal citations**: statute references (e.g. RTI Act 2005 §6) come only from the letter-type
   record in the DB, never from the model's memory.
3. **Letter structure is data + code, not LLM freeform.** The skeleton (sender block, date,
   addressee, subject line, salutation, closing, signature/thumb-impression line) is rendered
   deterministically from the `LetterType` record. The LLM writes only the body paragraphs.
4. **PII is inherent here — treat it accordingly.** Unlike Urimai discovery, a letter *needs*
   the sender's name and address. Collect the minimum, encrypt at rest (reuse the Phase-6
   apply-stage encryption approach), set a retention window (default: delete session PII and
   generated documents 30 days after delivery), honour "delete my details" on request.
5. **Tamil-first, voice-first. Channel-agnostic core.** Letter output is Tamil by default;
   English or bilingual on request (many TN offices accept Tamil; RTI to central bodies may
   need English — that preference lives on the `LetterType` record).
6. **"help" always routes to a human.** Reuse the existing escalation queue unchanged.
7. **Every draft and approval is logged** (facts used, template version, model, final text hash).

---

## 3. Relationship to Urimai — the reuse map

Same monorepo, same WhatsApp number, same backend. **Reuse, don't rewrite.** Before any new
feature code, Phase 0 extracts the shared plumbing out of `apps/whatsapp` into packages both
apps import:

| Existing code | Becomes | Used by |
|---|---|---|
| `apps/whatsapp/src/speech.ts` (SpeechProvider, Bhashini + Sarvam, incl. the Sarvam multipart workaround and the 1500-char TTS limit) | `packages/speech` | both channels |
| `apps/whatsapp/src/transcode.ts` (ffmpeg OGG↔WAV) | `packages/speech` (or `packages/transcode`) | both |
| `apps/whatsapp/src/whatsapp.ts` (webhook verify, inbound normalize, outbound client) | `packages/whatsapp-client` | both |
| `apps/whatsapp/src/escalation.ts` + help.ts | `packages/escalation` | both |
| `packages/cache` (Redis sessions) | as-is | both |
| `packages/extractor` (strict-JSON Claude extraction pattern: prompt + zod schema + safe fallback) | pattern copied into `packages/letters-extractor` with its own schema | Madal |
| `packages/orchestrator` (one-question-at-a-time gap loop, `handleTurn`, pendingField) | pattern copied into `packages/letters-orchestrator` | Madal |

The Urimai scheme-orchestrator stays untouched; its tests must still pass after the Phase-0
refactor. That is the acceptance bar for the extraction.

**Same-number routing.** One webhook, one handler entry point, two apps behind it. The session
record gains `app: "urimai" | "madal" | null`. On a fresh session the greeting asks (voice):
*"What do you need — check which government schemes you can get, or write a letter/complaint?"*
Intent keywords ("கடிதம்", "letter", "complaint", "புகார்", "விண்ணப்பம்", "scheme", "பணம்/உதவித்தொகை")
also switch mode mid-greeting. Once set, all turns route to that app's orchestrator until the
session ends or the user says the reset word. The router lives in the channel handler
(`apps/whatsapp`), NOT in either orchestrator.

---

## 4. New architecture pieces

- **`packages/letter-types`** — the letter-type catalogue (DB-backed, versioned, like schemes).
- **`packages/letters-extractor`** — speech/text → `LetterFacts` (Claude, strict JSON, zod).
- **`packages/letters-orchestrator`** — the conversation brain: classify type → fill required
  facts one question at a time → draft → read-back/correct loop → approved text. Pure of
  channel knowledge. Session state in Redis.
- **`packages/letters-drafter`** — given `LetterType` + `LetterFacts`, calls Claude to write
  body paragraphs, assembles the full letter deterministically. Returns structured
  `LetterDraft` (blocks, not one blob) so read-back can be chunked under the TTS limit.
- **`packages/addressee-directory`** — the government-office directory (DB-backed, versioned,
  like schemes). Resolves *letter type + jurisdiction* → **To-address + CC list**. See §6a.
- **`packages/docgen`** — `LetterDraft` → `.docx` (via the `docx` npm package) and `.pdf`.
  **Tamil rendering is the trap:** the PDF must embed a Tamil Unicode font (Noto Sans Tamil)
  and shape it correctly. Preferred route: render HTML → PDF via headless Chromium
  (`puppeteer`), which shapes Tamil properly; direct pdf-lib text drawing does NOT shape
  Tamil conjuncts. Verify with a golden-file visual check.
- **`apps/whatsapp`** — gains the app router + the Madal turn renderer (TTS read-back in
  chunks, document upload/send). WhatsApp can send documents with filename + caption — use it.
- **`apps/web`** — later phase: a Madal tab for literate users/operators (type instead of talk,
  see the draft, download files).

---

## 5. Stack additions

Everything else per `PROJECT_BRIEF.md` §4. New:

- `docx` (npm) for .docx generation.
- `puppeteer` (or `playwright`) for HTML→PDF with proper Tamil shaping; Noto Sans Tamil font
  files vendored in the repo (check license file in).
- No new LLM dependency — same Anthropic SDK, server-side only.

---

## 6. Core data model

```ts
// A letter type — the asset. DB-backed, versioned, human-verified, like Scheme.
type LetterType = {
  id: string;                 // "rti_request" | "police_complaint" | ... | "generic_petition"
  nameTamil: string;
  nameEnglish: string;
  addresseeHint: string;      // who this normally goes to; drives the addressee question
  requiredFacts: FactKey[];   // gap loop asks these, one at a time
  optionalFacts: FactKey[];
  languageDefault: "ta" | "en" | "bilingual";
  legalRefs: { label: string; citation: string; source: string }[]; // ONLY source of citations
  bodyGuidance: string;       // tone/structure notes injected into the drafting prompt
  version: number;
  verified: boolean;          // false until a human reviews the template + refs
};

type FactKey =
  | "sender_name" | "sender_address" | "sender_phone"
  | "addressee_name" | "addressee_office" | "addressee_address"
  | "subject" | "incident_date" | "incident_place" | "incident_details"
  | "prior_attempts" | "amount" | "reference_ids" | "relief_sought" | "attachments";

// What we learn from the user. All nullable; the gap loop fills required ones.
type LetterFacts = Partial<Record<FactKey, string>> & {
  letterTypeId: string | null;      // classified, user-confirmable
  language: "ta" | "en" | "bilingual" | null;
};

// Structured draft — blocks, so read-back can chunk and corrections can target a block.
type LetterDraft = {
  letterTypeId: string;
  typeVersion: number;
  senderBlock: string;
  date: string;
  addresseeBlock: string;
  subject: string;
  salutation: string;
  bodyParagraphs: string[];   // the ONLY LLM-authored part
  closing: string;
  signatureLine: string;      // supports thumb-impression wording
  language: "ta" | "en" | "bilingual";
};

type ApprovalRecord = {
  sessionId: string;
  draftHash: string;          // sha256 of final text
  approvedAt: string;
  approvalUtterance: string;  // transcript of the user's "yes"
  revisions: number;
};
```

Classification, extraction, and drafting are three separate LLM calls with three narrow
prompts — do not merge them into one mega-prompt.

---

## 6a. Addressee directory — offices are data too

The user should never have to know *who* to write to. The directory answers that
deterministically. Same discipline as schemes: every record versioned, `source` URL,
`verified: false` until a human checks it. **No LLM anywhere in resolution.**

```ts
// A government office — the To/CC asset. DB-backed, versioned, human-verified.
type Office = {
  id: string;                  // "tn_cm_cell", "tn_dgp", "dist_collector_madurai", ...
  designation: string;         // "The District Collector" — the OFFICE, never a person's name
  designationTamil: string;
  department: string;          // "Revenue", "Police", "Municipal Administration", ...
  addressLines: string[];      // postal address, one entry per printed line
  pincode: string;
  phone?: string;              // spoken to the user if they want to follow up
  email?: string;
  jurisdiction: {
    level: "state" | "district" | "taluk" | "municipality";
    state: "TN";
    district?: string;         // present iff level != "state"
    taluk?: string;
  };
  handles: string[];           // letterTypeIds this office is a valid To-address for
  ccFor: string[];             // letterTypeIds where this office belongs on the CC list
  contactPerson?: string;      // optional, expected to go stale — never required
  version: number;
  source: string;              // official URL the address was taken from
  verified: boolean;           // false until a human confirms against the source
  lastCheckedAt?: string;
};

// Pure function, no I/O, no LLM — unit-test it like the rules engine.
// Picks the most specific office (taluk > municipality > district > state) whose
// `handles` includes the letter type; CC list from `ccFor` + the type's escalation chain.
function resolveAddressees(
  letterTypeId: string,
  district: string | null,
  offices: Office[],
): { to: Office | null; cc: Office[] };
```

Rules for this directory:

1. **Designations, not people.** "The Superintendent of Police, Madurai District" outlives
   every transfer. `contactPerson` is cosmetic; a stale one must never block a letter.
2. **Fallback chain, never a dead end.** No district match → state-level office. No match at
   all → CM's Special Cell (`tn_cm_cell`), which accepts any grievance — so `to` is null only
   if the directory is empty. The old free-text `addresseeHint` remains the last resort.
3. **The gap loop shrinks.** With the directory, `addressee_*` facts are no longer asked —
   only the user's **district** (already known if the session did an Urimai flow — reuse it).
   User-supplied addressee details, when volunteered, override the directory.
4. **Unverified records still work, honestly.** An unverified address prints normally but the
   voice caption says "please confirm the address at the office / on the website" until a
   curator marks it `verified`.
5. **Staleness is managed, not assumed away.** `lastCheckedAt` + a curator re-check list
   (offices unchecked for > 12 months surface first). Wrong-address reports from users
   escalate to the curator queue.
6. **Seed data:** `packages/addressee-directory/seed/offices.seed.json` — state-level TN
   offices to start (see the CSV in `data/`), every record `verified: false` with its source
   URL. District rows (38 Collectors, SPs, Corporation Commissioners) are a later curation
   pass, not code.

---

## 7. Conversation flow (the spec to test against)

1. **Route.** Fresh session → greeting asks schemes vs letter (§3). User picks letter.
2. **Listen.** "Tell me what happened and what you want, in your own words." User speaks
   freely, possibly across several voice notes; concatenate transcripts for the session.
3. **Classify + extract.** Determine `letterTypeId` (fallback `generic_petition`) and pull
   every `LetterFacts` field already present. Confirm the type by voice in plain words:
   *"You want a complaint to the police about X — correct?"*
4. **Gap loop.** Ask for missing `requiredFacts` **one question at a time** (reuse the
   pendingField pattern). Never re-ask what's known. Addressee details are NOT asked —
   ask only the district, then `resolveAddressees()` fills To + CC (§6a). "I don't know"
   is an acceptable answer for optional facts.
5. **Draft.** Generate `LetterDraft`. Body must use only extracted facts (§2.2).
6. **Read-back loop.** TTS the draft in blocks (respect the 1500-char TTS limit — chunk on
   paragraph boundaries). Then ask: *"Should I change anything, or is this okay?"* A correction
   ("change the date", "add that I complained before") re-extracts, re-drafts, re-reads only
   the changed part. Loop until explicit approval. Cap at N=5 revisions, then offer escalation.
7. **Deliver.** On approval: generate .docx + .pdf, send both as WhatsApp documents with a
   Tamil caption saying what it is and what to do with it (sign/thumb-print, where to submit —
   from `addresseeHint`). Log `ApprovalRecord`. Offer: "say 'again' for another letter."
8. **Anytime:** "help" → escalation queue; reset word → clean session.

---

## 8. Build plan — one phase at a time

After each phase, stop and report what was built and how to verify it.

**Phase 0 — Shared-plumbing refactor + scaffold.** Extract `packages/speech`,
`packages/whatsapp-client`, `packages/escalation` from `apps/whatsapp` (§3 table); update
imports; add Prisma models for `LetterType`, drafts, approvals; seed 6 letter types + generic
fallback, all `verified: false`, legal refs flagged for human verification.
*Accept:* all existing Urimai tests pass unchanged; `pnpm seed` inserts letter types; nothing
user-visible changed.

**Phase 1 — Letter-type catalogue + docgen (the deterministic spine).** `packages/letter-types`
and `packages/docgen`. Given a hand-written fixture `LetterDraft`, produce a correct .docx and
.pdf with properly shaped Tamil.
*Accept:* golden-file tests for docx structure; a generated Tamil PDF opens with correct
conjunct rendering (manual visual check on one golden sample); no LLM anywhere in this phase.

**Phase 2 — Facts extractor + classifier.** `packages/letters-extractor`: classification and
fact extraction as separate strict-JSON calls, zod-validated, safe fallback to
`generic_petition` / empty facts on parse failure.
*Accept:* sample Tamil + English narrations (police complaint, RTI, civic grievance, something
uncategorizable) classify and extract correctly; malformed model output never crashes.

**Phase 3 — Letters orchestrator + drafter.** The full flow of §7 steps 2–6 as channel-agnostic
code with Redis sessions. Drafter enforces facts-only bodies and DB-only citations.
*Accept:* a scripted text simulation (like the Urimai sim) drives: narration → gap questions →
draft → one correction → approval → final `LetterDraft`; a test proves a fact absent from
input never appears in the body (probe with a bait prompt); revision cap works.

**Phase 4 — WhatsApp integration + same-number routing.** App router in the channel handler
(§3); Madal turn renderer: chunked TTS read-back, document send, approval capture. Urimai flow
must be regression-tested through the same webhook.
*Accept:* on a real WhatsApp number, both flows work in one day's traffic: a scheme check AND
a full voice-driven letter ending in received .pdf + .docx; "help" escalates from both modes.

**Phase 5 — Web front end for Madal.** A tab/route in `apps/web`: typed input, visible draft
with per-block edit, download buttons. Serves literate users and operators.
*Accept:* full letter produced end-to-end in the browser against the real backend; no API key
client-side.

**Phase 5a — Addressee directory.** `packages/addressee-directory`: Prisma model, seed loader
for `data/tn_offices_seed.csv` → `offices.seed.json`, pure `resolveAddressees()`, wired into
the orchestrator (replaces the addressee gap questions with the single district question),
unverified-address voice caveat, and the CC block rendered in docgen.
*Accept:* unit tests cover specificity ordering (taluk > district > state), the CM-Cell
fallback, user-override, and unverified caveat; a letter generated end-to-end carries a
correct To block and CC list from seed data alone; no LLM call in resolution.

**Phase 6 — PII lifecycle + audit hardening.** Encryption at rest for facts/drafts/documents,
30-day retention sweep, "delete my details" voice command, immutable draft/approval audit.
*Accept:* PII encrypted at rest (verify in DB), sweep deletes expired sessions' PII and files,
delete-on-request works from WhatsApp, every delivered letter has an `ApprovalRecord`.

---

## 9. Working agreement for Claude Code

- Phase 0's bar is **zero Urimai regressions** — run the full existing test suite before and
  after the refactor and diff the results.
- **Never** let the drafter emit a legal citation that isn't in the `LetterType` record.
- **Never** deliver a document without a logged approval.
- Letter-type records ship `verified: false`; do not invent addressee formats or legal
  references — leave marked placeholders and say so.
- Respect the constraints already discovered in the codebase: Sarvam's multipart quirk, the
  1500-char TTS limit, WhatsApp's no-WAV rule, ffmpeg at the channel edge only.
- Secrets in env vars; the browser never holds the Anthropic key.
- Produce a runnable slice per phase + a one-paragraph "how to verify".
- Ask before adding a new external dependency or a new letter type's legal references.
