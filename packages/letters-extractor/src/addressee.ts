/**
 * Addressee resolution via web search (user decision, July 2026: search instead of the
 * static seed for To/CC addresses — the curator directory remains the FALLBACK when
 * search finds nothing usable).
 *
 * Safety posture, because an address on a formal letter must never be invented:
 *  - The web_search server tool is restricted to OFFICIAL domains (gov.in / nic.in),
 *    so the model cannot cite a blog or a stale third-party listing.
 *  - The model must return the exact source URL for every office; the URL's host is
 *    RE-VALIDATED in code against the official-domain allowlist — a result whose
 *    source fails validation is dropped.
 *  - Any failure (network, refusal, junk output, nothing found) returns nulls and the
 *    caller falls back to the curator directory. This call never throws.
 */
import type { LetterFacts, LetterType, OfficeAddress } from "@urimai/types";
import Anthropic from "@anthropic-ai/sdk";

/** Official domains searches are limited to AND sources are validated against. */
export const OFFICIAL_DOMAINS = ["gov.in", "nic.in", "tnega.org"];

export interface AddresseeSearchResult {
  to: OfficeAddress | null;
  cc: OfficeAddress[];
}

/** Minimal client surface for the search call (tools + multi-block content). */
export interface SearchClient {
  messages: {
    create(args: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: "user" | "assistant"; content: unknown }>;
      tools: unknown[];
    }): Promise<{ content: Array<Record<string, unknown>>; stop_reason?: string | null }>;
  };
}

export interface SearchAddresseeOptions {
  client?: SearchClient;
  model?: string;
  apiKey?: string;
  /**
   * Curated designations from the grievance-category chain — when set, the search's
   * job shrinks to finding the postal address of THESE offices for the user's place
   * (no jurisdiction reasoning needed; the curator already decided who acts).
   */
  targetTo?: string;
  targetCc?: string[];
}

const FALLBACK_MODEL = "claude-opus-4-8";
const EMPTY: AddresseeSearchResult = { to: null, cc: [] };

const SYSTEM_PROMPT = `You find the correct government office (designation + full postal address) that a citizen's formal letter in Tamil Nadu, India should be addressed to, and up to 2 offices that should receive a copy (நகல்).

FIRST think about jurisdiction, based on the citizen's actual situation:
- WHO has the power to act on this specific matter? (a theft → the police station/SP with territorial jurisdiction; unpaid wages → the district Labour Officer; drainage → the commissioner/EO of THAT town's local body; a stopped pension → the taluk office where they applied)
- The To office should be the most LOCAL office that can actually act. The CC offices should be the SUPERVISORY level above it (so inaction is visible upward) and/or a grievance cell — not random offices.

Then use web search (restricted to official government sites) to find those specific offices' real addresses. RULES:
- Report ONLY a designation and address you actually read on an official page. NEVER compose an address from memory or guess a pincode.
- If the exact local office's address is not verifiable, fall back to its district or state office — with its real address.
- If you cannot confidently find an official address, return null for "to" — that is a good answer; a wrong address is the worst answer.

# OUTPUT
After searching, return ONLY one JSON object, no prose around it:
{
  "to": {"designationTamil": "<designation in Tamil>", "designation": "<in English>", "addressLines": ["...", "..."], "pincode": "600001" | null, "source": "<exact URL of the official page>"} | null,
  "cc": [ up to 2 of the same shape ]
}`;

export function buildAddresseeSearchPrompt(
  type: LetterType,
  facts: LetterFacts,
  targetTo?: string,
  targetCc?: string[],
): string {
  if (targetTo) {
    const clues = [
      facts.incident_place ? `Place of the matter: ${facts.incident_place}` : null,
      facts.sender_address ? `Sender lives at: ${facts.sender_address}` : null,
    ].filter(Boolean);
    const cc = targetCc && targetCc.length > 0 ? `\nCC office designation(s) to also locate: ${targetCc.join("; ")}` : "";
    return `The competent authority is ALREADY DECIDED (curated data) — do NOT re-reason jurisdiction.
To office designation: ${targetTo}${cc}
${clues.length > 0 ? clues.join("\n") : "No place given — use the Tamil Nadu state-level office of that designation."}

Find the real postal address of the To office for the citizen's place (the local/district office of that designation), and of the CC office(s) if listed, from official sources, then return the JSON object.`;
  }
  return buildJurisdictionPrompt(type, facts);
}

function buildJurisdictionPrompt(type: LetterType, facts: LetterFacts): string {
  const clues = [
    facts.incident_details ? `What happened (their words): ${facts.incident_details}` : null,
    facts.relief_sought ? `What they want done: ${facts.relief_sought}` : null,
    facts.incident_place ? `Place of the matter: ${facts.incident_place}` : null,
    facts.sender_address ? `Sender lives at: ${facts.sender_address}` : null,
    facts.prior_attempts ? `Already tried: ${facts.prior_attempts}` : null,
    facts.addressee_name ? `User mentioned addressee name: ${facts.addressee_name}` : null,
  ].filter(Boolean);
  return `Letter type: ${type.nameEnglish} / ${type.nameTamil}
Usual recipient (curator hint): ${type.addresseeHint}
${clues.length > 0 ? clues.join("\n") : "No situation/place information given — use the appropriate Tamil Nadu state-level office."}

Reason about which office has jurisdiction over THIS situation, then find that To office (and up to 2 supervisory/grievance CC offices) with full postal addresses from official sources, and return the JSON object.`;
}

function isOfficialUrl(source: unknown): boolean {
  if (typeof source !== "string") return false;
  try {
    const host = new URL(source).hostname.toLowerCase();
    return OFFICIAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** Validate one office object from the model; null when unusable. */
function toOfficeAddress(v: unknown): OfficeAddress | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const designationTamil = typeof o.designationTamil === "string" ? o.designationTamil.trim() : "";
  const designation = typeof o.designation === "string" ? o.designation.trim() : "";
  const addressLines = Array.isArray(o.addressLines)
    ? o.addressLines.filter((l): l is string => typeof l === "string" && l.trim().length > 0).map((l) => l.trim())
    : [];
  const pincode = typeof o.pincode === "string" && /^\d{6}$/.test(o.pincode.trim()) ? o.pincode.trim() : null;
  if ((designationTamil.length === 0 && designation.length === 0) || addressLines.length === 0) return null;
  if (!isOfficialUrl(o.source)) return null; // unverifiable → unusable on a letter
  return {
    designationTamil: designationTamil || designation,
    designation: designation || undefined,
    addressLines,
    pincode,
    source: o.source as string,
  };
}

/** Parse the model's final text into a validated result. Never throws. */
export function parseAddresseeSearch(raw: string): AddresseeSearchResult {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  let obj = tryParse((raw ?? "").trim());
  if (!obj) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end > start) obj = tryParse(raw.slice(start, end + 1));
  }
  if (!obj) return { ...EMPTY };

  const to = toOfficeAddress(obj.to);
  const cc = (Array.isArray(obj.cc) ? obj.cc : [])
    .map(toOfficeAddress)
    .filter((o): o is OfficeAddress => o !== null)
    .slice(0, 2);
  return { to, cc };
}

/** All text-block content, joined — the final answer follows the search result blocks. */
function collectText(content: Array<Record<string, unknown>>): string {
  return content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
}

/**
 * Search official sources for the To/CC offices. Never throws; nulls on any failure
 * (the caller falls back to the curator directory).
 */
export async function searchAddressee(
  type: LetterType,
  facts: LetterFacts,
  opts: SearchAddresseeOptions = {},
): Promise<AddresseeSearchResult> {
  try {
    const client: SearchClient =
      opts.client ?? (new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {}) as unknown as SearchClient);
    const model = opts.model ?? process.env.ANTHROPIC_MODEL ?? FALLBACK_MODEL;

    const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [
      { role: "user", content: buildAddresseeSearchPrompt(type, facts, opts.targetTo, opts.targetCc) },
    ];

    let response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages,
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: 5,
          allowed_domains: OFFICIAL_DOMAINS,
        },
      ],
    });

    // Server-tool loops can pause; resume by echoing the assistant turn (bounded).
    for (let i = 0; i < 3 && response.stop_reason === "pause_turn"; i++) {
      messages.push({ role: "assistant", content: response.content });
      response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages,
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 5, allowed_domains: OFFICIAL_DOMAINS },
        ],
      });
    }

    return parseAddresseeSearch(collectText(response.content));
  } catch (err) {
    console.warn(
      "[letters-extractor] addressee web search failed; falling back to directory:",
      err instanceof Error ? err.message : String(err),
    );
    return { ...EMPTY };
  }
}
