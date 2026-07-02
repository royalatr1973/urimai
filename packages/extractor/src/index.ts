/**
 * @urimai/extractor — Claude-backed profile extractor (Phase 2).
 *
 * The LLM understands; it never decides. This package turns free Tamil/English text
 * into a validated `Profile`; eligibility is decided later by @urimai/engine.
 */
export { extractProfile, type ExtractOptions, type ExtractorClient } from "./extract.js";
export { parseProfile, sanitizeProfile, deriveIsTamilNadu } from "./schema.js";
export { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
