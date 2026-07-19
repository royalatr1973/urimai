/**
 * Letter-fact extraction — one narrow Claude call. Never throws: on any failure it
 * returns empty facts and the conversation degrades to asking questions, never a crash
 * (LETTERS_BRIEF Phase 2 acceptance).
 */
import type { FactKey, LetterFacts } from "@urimai/types";
import { firstText, resolveClient, resolveModel, type CallOptions } from "./client.js";
import { buildExtractUserPrompt, EXTRACT_SYSTEM_PROMPT } from "./prompt.js";
import { parseLetterFacts } from "./schema.js";

export interface ExtractFactsOptions extends CallOptions {
  /**
   * The fact the gap loop just asked about, if any — lets a bare reply ("சாந்தி",
   * "9876543210") land on the right key. Supplied per-turn by the orchestrator.
   */
  pendingFact?: FactKey | null;
}

const EMPTY: LetterFacts = { letterTypeId: null, language: null };

/** Extract letter facts from a narration. Never throws; empty facts on any failure. */
export async function extractLetterFacts(text: string, opts: ExtractFactsOptions = {}): Promise<LetterFacts> {
  if (!text || text.trim().length === 0) return { ...EMPTY };

  try {
    const msg = await resolveClient(opts).messages.create({
      model: resolveModel(opts),
      max_tokens: 1024,
      system: EXTRACT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildExtractUserPrompt(text, opts.pendingFact) }],
    });
    return parseLetterFacts(firstText(msg));
  } catch (err) {
    console.warn(
      "[letters-extractor] fact extraction failed; returning empty facts:",
      err instanceof Error ? err.message : String(err),
    );
    return { ...EMPTY };
  }
}
