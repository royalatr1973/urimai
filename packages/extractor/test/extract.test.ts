import { describe, it, expect, vi } from "vitest";
import { EMPTY_PROFILE } from "@urimai/types";
import { extractProfile, type ExtractorClient } from "../src/index.js";

/** A fake Claude client that returns a fixed text block (the "model output"). */
function clientReturning(text: string): ExtractorClient & { create: ReturnType<typeof vi.fn> } {
  const create = vi.fn(async () => ({ content: [{ type: "text", text }] }));
  return { messages: { create }, create };
}

describe("extractProfile — pipeline wiring", () => {
  it("sends the system prompt and the user's words, then parses the result", async () => {
    const client = clientReturning('{"age": 67}');
    const profile = await extractProfile("எனக்கு வயசு 67", { client, model: "claude-opus-4-8" });

    expect(profile.age).toBe(67);
    expect(client.create).toHaveBeenCalledOnce();
    const args = client.create.mock.calls[0]![0];
    expect(args.model).toBe("claude-opus-4-8");
    expect(args.system).toMatch(/null over guess/i);
    expect(args.messages[0].content).toContain("எனக்கு வயசு 67");
  });

  it("short-circuits empty input without calling the model", async () => {
    const client = clientReturning("{}");
    const profile = await extractProfile("   ", { client });
    expect(profile).toEqual(EMPTY_PROFILE);
    expect(client.create).not.toHaveBeenCalled();
  });
});

describe("extractProfile — the three subtle cases (given correct model output)", () => {
  it("daily-wage work → has_regular_income stays null", async () => {
    const client = clientReturning(
      JSON.stringify({ has_regular_income: null, monthly_income: null }),
    );
    const p = await extractProfile("தினக்கூலி வேலை, சில நாள் இருக்கும் சில நாள் இல்ல", { client });
    expect(p.has_regular_income).toBeNull();
  });

  it("individual monthly income does not become family annual income", async () => {
    const client = clientReturning(
      JSON.stringify({ monthly_income: 1200, annual_family_income: null }),
    );
    const p = await extractProfile("எனக்கு மாசம் 1200 ரூபா வருது", { client });
    expect(p.monthly_income).toBe(1200);
    expect(p.annual_family_income).toBeNull();
  });

  it("நஞ்சை (wet) land maps to land_acres_wet, dry stays null", async () => {
    const client = clientReturning(
      JSON.stringify({ land_acres_wet: 0.5, land_acres_dry: null }),
    );
    const p = await extractProfile("அரை ஏக்கர் நஞ்சை நிலம்", { client });
    expect(p.land_acres_wet).toBe(0.5);
    expect(p.land_acres_dry).toBeNull();
  });
});

describe("extractProfile — resilience (never crashes)", () => {
  it("returns EMPTY_PROFILE when the model returns unparseable prose", async () => {
    const client = clientReturning("Sorry, I didn't catch that.");
    const p = await extractProfile("...", { client });
    expect(p).toEqual(EMPTY_PROFILE);
  });

  it("returns EMPTY_PROFILE when the API call throws", async () => {
    const client: ExtractorClient = {
      messages: {
        create: async () => {
          throw new Error("network down");
        },
      },
    };
    const p = await extractProfile("anything", { client });
    expect(p).toEqual(EMPTY_PROFILE);
  });
});
