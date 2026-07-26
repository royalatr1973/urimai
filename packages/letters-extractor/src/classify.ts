/**
 * Letter-type classification — one narrow Claude call. On ANY failure (network, auth,
 * malformed output, hallucinated id) the answer degrades to the generic petition:
 * classification can never turn a user away (LETTERS_BRIEF §1).
 */
import type { LetterType } from "@urimai/types";
import { recordAnthropicUsage } from "@urimai/usage";
import { firstText, resolveClient, resolveModel, type CallOptions } from "./client.js";
import { buildClassifyQuestion, buildClassifyReference, CLASSIFY_SYSTEM_PROMPT } from "./prompt.js";
import { parseClassification, type Classification } from "./schema.js";

export const GENERIC_FALLBACK_ID = "generic_petition";

/**
 * Classify which letter type (skeleton) AND which curator grievance category the
 * narration calls for — one narrow call, both ids validated against live data.
 * `types` and `categoryIds` come from the DB (never hardcoded). Never throws.
 */
export async function classifyLetter(
  text: string,
  types: Pick<LetterType, "id" | "nameEnglish" | "nameTamil">[],
  opts: CallOptions = {},
  categoryIds: string[] = [],
): Promise<Classification> {
  const fallback: Classification = { letterTypeId: GENERIC_FALLBACK_ID, categoryId: null, language: null };
  if (!text || text.trim().length === 0 || types.length === 0) return fallback;

  try {
    const msg = await resolveClient(opts).messages.create({
      model: resolveModel(opts),
      max_tokens: 256,
      // Static instructions + letter types + 300 categories → one cached system block.
      // The variable citizen text stays in the user message so the cache prefix is stable.
      system: [
        {
          type: "text",
          text: `${CLASSIFY_SYSTEM_PROMPT}\n\n${buildClassifyReference(types, GENERIC_FALLBACK_ID, categoryIds)}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: buildClassifyQuestion(text) }],
    });
    recordAnthropicUsage((msg as { usage?: Parameters<typeof recordAnthropicUsage>[0] }).usage);
    return parseClassification(firstText(msg), types.map((t) => t.id), GENERIC_FALLBACK_ID, categoryIds);
  } catch (err) {
    console.warn(
      "[letters-extractor] classification failed; falling back to generic petition:",
      err instanceof Error ? err.message : String(err),
    );
    return fallback;
  }
}
