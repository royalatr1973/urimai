/**
 * Addressee web search — the safety net is deterministic validation: an office is
 * usable ONLY with a real designation, address lines, and a source URL on an official
 * government domain. Everything else degrades to null (→ directory fallback).
 */
import { describe, it, expect, vi } from "vitest";
import { SEED_LETTER_TYPES } from "@urimai/letter-types";
import { parseAddresseeSearch, searchAddressee, type SearchClient } from "../src/addressee.js";

const POLICE = SEED_LETTER_TYPES.find((t) => t.id === "police_complaint")!;
const FACTS = { letterTypeId: "police_complaint" as string | null, language: null, incident_place: "கடலூர்" };

const GOOD = JSON.stringify({
  to: {
    designationTamil: "மாவட்ட காவல் கண்காணிப்பாளர், கடலூர்",
    designation: "Superintendent of Police, Cuddalore",
    addressLines: ["SP Office, Manjakuppam", "Cuddalore"],
    pincode: "607001",
    source: "https://cuddalore.nic.in/police/",
  },
  cc: [
    {
      designationTamil: "காவல்துறை தலைமை இயக்குநர்",
      addressLines: ["Dr. Radhakrishnan Salai", "Chennai"],
      pincode: "600004",
      source: "https://www.tn.gov.in/detail_contact/6946/4",
    },
  ],
});

describe("parseAddresseeSearch — validation is the guarantee", () => {
  it("accepts a well-formed result from official sources", () => {
    const r = parseAddresseeSearch(GOOD);
    expect(r.to?.designationTamil).toContain("கண்காணிப்பாளர்");
    expect(r.to?.pincode).toBe("607001");
    expect(r.cc).toHaveLength(1);
  });

  it("REJECTS an office whose source is not an official government domain", () => {
    const shady = GOOD.replace("https://cuddalore.nic.in/police/", "https://some-blog.com/tn-police-addresses");
    expect(parseAddresseeSearch(shady).to).toBeNull();
  });

  it("rejects missing addresses, junk pincode values, and non-JSON replies", () => {
    expect(parseAddresseeSearch('{"to":{"designationTamil":"அலுவலர்","addressLines":[],"source":"https://tn.gov.in/x"},"cc":[]}').to).toBeNull();
    const badPin = parseAddresseeSearch(GOOD.replace("607001", "call 1091"));
    expect(badPin.to?.pincode).toBeNull(); // bad pincode dropped, office kept
    expect(parseAddresseeSearch("I could not find it").to).toBeNull();
    expect(parseAddresseeSearch("").to).toBeNull();
  });

  it("caps CC at 2", () => {
    const cc3 = JSON.parse(GOOD);
    cc3.cc = [cc3.cc[0], cc3.cc[0], cc3.cc[0]];
    expect(parseAddresseeSearch(JSON.stringify(cc3)).cc).toHaveLength(2);
  });
});

describe("searchAddressee", () => {
  it("restricts the search tool to official domains and returns the validated result", async () => {
    const client: SearchClient = {
      messages: {
        create: vi.fn(async (args: { tools: unknown[] }) => ({
          content: [
            { type: "server_tool_use", name: "web_search" },
            { type: "web_search_tool_result", content: [] },
            { type: "text", text: GOOD },
          ],
          stop_reason: "end_turn",
        })),
      },
    };
    const r = await searchAddressee(POLICE, FACTS, { client });
    expect(r.to?.source).toContain("nic.in");
    const call = (client.messages.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const tool = call.tools[0] as { type: string; allowed_domains: string[] };
    expect(tool.type).toBe("web_search_20260209");
    expect(tool.allowed_domains).toContain("gov.in");
    expect(call.messages[0].content).toContain("கடலூர்"); // district clue passed to the search
  });

  it("API failure or junk output never throws — nulls (directory fallback) instead", async () => {
    const down: SearchClient = {
      messages: { create: vi.fn(async () => { throw new Error("search unavailable"); }) },
    };
    expect(await searchAddressee(POLICE, FACTS, { client: down })).toEqual({ to: null, cc: [] });

    const junk: SearchClient = {
      messages: { create: vi.fn(async () => ({ content: [{ type: "text", text: "no luck" }], stop_reason: "end_turn" })) },
    };
    expect(await searchAddressee(POLICE, FACTS, { client: junk })).toEqual({ to: null, cc: [] });
  });

  it("resumes a paused server-tool turn (bounded)", async () => {
    let calls = 0;
    const pausing: SearchClient = {
      messages: {
        create: vi.fn(async () => {
          calls += 1;
          if (calls === 1) return { content: [{ type: "server_tool_use" }], stop_reason: "pause_turn" };
          return { content: [{ type: "text", text: GOOD }], stop_reason: "end_turn" };
        }),
      },
    };
    const r = await searchAddressee(POLICE, FACTS, { client: pausing });
    expect(calls).toBe(2);
    expect(r.to).not.toBeNull();
  });
});
