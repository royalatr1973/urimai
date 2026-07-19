/**
 * draftLetter — assemble a complete LetterDraft. Skeleton: deterministic (skeleton.ts).
 * Body: one narrow Claude call, then the facts-only guard; any failure (API down, junk
 * output, guard violation) swaps in the deterministic fallback body built from the
 * user's own words. Drafting never throws and never ships invented content.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { LetterDraft, LetterFacts, LetterType } from "@urimai/types";
import { buildFallbackBody } from "./fallback.js";
import { checkBodyAgainstFacts } from "./guard.js";
import { buildDraftUserPrompt, DRAFT_SYSTEM_PROMPT, type CorrectionContext } from "./prompt.js";
import {
  buildAddresseeBlock,
  buildClosing,
  buildCopyTo,
  buildDisclaimer,
  buildSalutation,
  buildSenderBlock,
  buildSignatureLine,
  buildSubject,
  formatDate,
  type Language,
} from "./skeleton.js";

/** Minimal Anthropic surface, injected for tests (same shape as the extractor's). */
export interface DrafterClient {
  messages: {
    create(args: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: "user"; content: string }>;
    }): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

export interface DraftOptions {
  client?: DrafterClient;
  model?: string;
  apiKey?: string;
  /** Language override (the orchestrator resolves user choice vs type default). */
  language?: Language;
  /** Injected date for deterministic tests; defaults to today (dd-mm-yyyy). */
  date?: string;
  /** Read-back correction: the change the user asked for, plus the body it applies to. */
  correction?: CorrectionContext;
}

export interface DraftOutcome {
  draft: LetterDraft;
  /** "llm" when the model's body passed the guard; "fallback" otherwise. */
  bodySource: "llm" | "fallback";
  /** Guard violations that forced the fallback (empty when bodySource is "llm"). */
  violations: string[];
}

const FALLBACK_MODEL = "claude-opus-4-8";

function firstText(msg: { content: Array<{ type: string; text?: string }> }): string {
  for (const block of msg.content) {
    if (block.type === "text" && typeof block.text === "string") return block.text;
  }
  return "";
}

/** Parse {"bodyParagraphs": [...]} tolerantly. null on anything unusable. */
export function parseBodyParagraphs(raw: string): string[] | null {
  const tryParse = (s: string): string[] | null => {
    try {
      const v = JSON.parse(s);
      const arr = v && typeof v === "object" && !Array.isArray(v) ? (v as { bodyParagraphs?: unknown }).bodyParagraphs : null;
      if (!Array.isArray(arr)) return null;
      const out = arr.filter((p): p is string => typeof p === "string" && p.trim().length > 0).map((p) => p.trim());
      return out.length > 0 ? out : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(raw.trim());
  if (direct) return direct;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return tryParse(raw.slice(start, end + 1));
  return null;
}

export async function draftLetter(type: LetterType, facts: LetterFacts, opts: DraftOptions = {}): Promise<DraftOutcome> {
  const language: Language = opts.language ?? facts.language ?? type.languageDefault;
  const date = opts.date ?? formatDate(new Date());

  let bodyParagraphs: string[] | null = null;
  let bodySource: DraftOutcome["bodySource"] = "fallback";
  let violations: string[] = [];

  try {
    const client: DrafterClient =
      opts.client ?? (new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {}) as unknown as DrafterClient);
    const msg = await client.messages.create({
      model: opts.model ?? process.env.ANTHROPIC_MODEL ?? FALLBACK_MODEL,
      max_tokens: 1024,
      system: DRAFT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildDraftUserPrompt(type, facts, language, opts.correction) }],
    });
    const parsed = parseBodyParagraphs(firstText(msg));
    if (parsed) {
      const verdict = checkBodyAgainstFacts(parsed, facts);
      if (verdict.ok) {
        bodyParagraphs = parsed;
        bodySource = "llm";
      } else {
        violations = verdict.violations;
        console.warn("[letters-drafter] body failed facts-only guard; using fallback:", verdict.violations.join("; "));
      }
    }
  } catch (err) {
    console.warn("[letters-drafter] body call failed; using fallback:", err instanceof Error ? err.message : String(err));
  }

  if (!bodyParagraphs) bodyParagraphs = buildFallbackBody(facts, language);

  return {
    draft: {
      letterTypeId: type.id,
      typeVersion: type.version,
      senderBlock: buildSenderBlock(facts),
      date,
      addresseeBlock: buildAddresseeBlock(type, facts),
      subject: buildSubject(type, facts, language),
      salutation: buildSalutation(language),
      bodyParagraphs,
      closing: buildClosing(language),
      signatureLine: buildSignatureLine(facts, language),
      copyTo: buildCopyTo(facts),
      disclaimer: buildDisclaimer(language),
      language,
    },
    bodySource,
    violations,
  };
}
