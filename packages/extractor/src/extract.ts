/**
 * Server-side profile extractor. Sends free text to Claude and returns a validated
 * Profile. The Anthropic API key stays server-side (env / opts) — never the browser.
 *
 * The Claude call is injected via `opts.client`, so the whole pipeline is unit-testable
 * without a network call. On ANY failure (network, auth, malformed output) it returns a
 * safe empty profile rather than throwing — the conversation degrades to "ask a question",
 * never a crash.
 */
import Anthropic from "@anthropic-ai/sdk";
import { EMPTY_PROFILE, type Profile } from "@urimai/types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import { parseProfile } from "./schema.js";

/** Minimal shape of the Anthropic messages API we depend on (for injection/testing). */
export interface ExtractorClient {
  messages: {
    create(args: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: "user"; content: string }>;
    }): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

export interface ExtractOptions {
  /** Inject a client (real Anthropic by default). Used to mock Claude in tests. */
  client?: ExtractorClient;
  /** Override the model. Defaults to ANTHROPIC_MODEL env, then claude-opus-4-8. */
  model?: string;
  /** Override the API key. Defaults to the ANTHROPIC_API_KEY env var. */
  apiKey?: string;
  /**
   * The Profile field the user was just asked about, if any. Lets the extractor
   * resolve bare answers ("no", "50000", "half acre") to the correct field instead
   * of dropping them as ambiguous. Set by the orchestrator per-turn from the session.
   */
  pendingField?: string | null;
}

const FALLBACK_MODEL = "claude-opus-4-8";

/** Pull the first text block out of a Claude response. */
function firstText(msg: { content: Array<{ type: string; text?: string }> }): string {
  for (const block of msg.content) {
    if (block.type === "text" && typeof block.text === "string") return block.text;
  }
  return "";
}

/**
 * Extract a structured Profile from a free-text Tamil/English situation description.
 * Never throws — returns EMPTY_PROFILE on any failure.
 */
export async function extractProfile(text: string, opts: ExtractOptions = {}): Promise<Profile> {
  if (!text || text.trim().length === 0) return { ...EMPTY_PROFILE };

  const model = opts.model ?? process.env.ANTHROPIC_MODEL ?? FALLBACK_MODEL;

  try {
    const client: ExtractorClient =
      opts.client ??
      (new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {}) as unknown as ExtractorClient);

    const msg = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(text, opts.pendingField) }],
    });

    return parseProfile(firstText(msg));
  } catch (err) {
    console.warn(
      "[extractor] extraction failed; returning empty profile:",
      err instanceof Error ? err.message : String(err),
    );
    return { ...EMPTY_PROFILE };
  }
}
