/**
 * Minimal shape of the Anthropic messages API both calls depend on — injected so the
 * whole pipeline is unit-testable without a network call (same pattern as
 * packages/extractor). The real Anthropic client is the default at runtime; the key
 * stays server-side, never the browser.
 */
import Anthropic from "@anthropic-ai/sdk";

export interface LettersClient {
  messages: {
    create(args: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: "user"; content: string }>;
    }): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

export interface CallOptions {
  /** Inject a client (real Anthropic by default). Used to mock Claude in tests. */
  client?: LettersClient;
  /** Override the model. Defaults to ANTHROPIC_MODEL env, then claude-opus-4-8. */
  model?: string;
  /** Override the API key. Defaults to the ANTHROPIC_API_KEY env var. */
  apiKey?: string;
}

export const FALLBACK_MODEL = "claude-opus-4-8";

export function resolveModel(opts: CallOptions): string {
  return opts.model ?? process.env.ANTHROPIC_MODEL ?? FALLBACK_MODEL;
}

export function resolveClient(opts: CallOptions): LettersClient {
  return (
    opts.client ??
    (new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {}) as unknown as LettersClient)
  );
}

/** Pull the first text block out of a Claude response. */
export function firstText(msg: { content: Array<{ type: string; text?: string }> }): string {
  for (const block of msg.content) {
    if (block.type === "text" && typeof block.text === "string") return block.text;
  }
  return "";
}
