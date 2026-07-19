/**
 * Letter-type classification — one narrow Claude call. On ANY failure (network, auth,
 * malformed output, hallucinated id) the answer degrades to the generic petition:
 * classification can never turn a user away (LETTERS_BRIEF §1).
 */
import type { LetterType } from "@urimai/types";
import { firstText, resolveClient, resolveModel, type CallOptions } from "./client.js";
import { buildClassifyUserPrompt, CLASSIFY_SYSTEM_PROMPT } from "./prompt.js";
import { parseClassification, type Classification } from "./schema.js";

export const GENERIC_FALLBACK_ID = "generic_petition";

/**
 * Classify which letter type the narration calls for. `types` is the live catalogue
 * (loaded from the DB by the caller — ids are data, never hardcoded here). Never throws.
 */
export async function classifyLetter(
  text: string,
  types: Pick<LetterType, "id" | "nameEnglish" | "nameTamil">[],
  opts: CallOptions = {},
): Promise<Classification> {
  const fallback: Classification = { letterTypeId: GENERIC_FALLBACK_ID, language: null };
  if (!text || text.trim().length === 0 || types.length === 0) return fallback;

  try {
    const msg = await resolveClient(opts).messages.create({
      model: resolveModel(opts),
      max_tokens: 256,
      system: CLASSIFY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildClassifyUserPrompt(text, types, GENERIC_FALLBACK_ID) }],
    });
    return parseClassification(firstText(msg), types.map((t) => t.id), GENERIC_FALLBACK_ID);
  } catch (err) {
    console.warn(
      "[letters-extractor] classification failed; falling back to generic petition:",
      err instanceof Error ? err.message : String(err),
    );
    return fallback;
  }
}
