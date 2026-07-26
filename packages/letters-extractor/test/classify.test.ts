import { describe, it, expect, vi } from "vitest";
import { SEED_LETTER_TYPES } from "@urimai/letter-types";
import type { LettersClient } from "../src/client.js";
import { classifyLetter, GENERIC_FALLBACK_ID } from "../src/classify.js";

const reply = (text: string): LettersClient => ({
  messages: { create: vi.fn(async () => ({ content: [{ type: "text", text }] })) },
});

describe("classifyLetter", () => {
  it("returns the model's choice when it is a real catalogue id", async () => {
    const r = await classifyLetter(
      "என் வீட்டு அருகில் திருட்டு நடந்தது, போலீஸுக்கு புகார் எழுத வேணும்",
      SEED_LETTER_TYPES,
      { client: reply('{"letterTypeId":"police_complaint","language":null}') },
    );
    expect(r.letterTypeId).toBe("police_complaint");
  });

  it("caches the catalogue in the system block and sends the narration in the message", async () => {
    const client = reply('{"letterTypeId":"rti_request","language":null}');
    await classifyLetter("I want to know the status of my ration card application", SEED_LETTER_TYPES, { client });
    const call = (client.messages.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    // The static catalogue → a cached system block (prompt caching).
    const sys = (call.system as Array<{ text: string; cache_control?: unknown }>)[0]!;
    expect(sys.cache_control).toEqual({ type: "ephemeral" });
    for (const t of SEED_LETTER_TYPES) expect(sys.text).toContain(`- ${t.id}: `);
    expect(sys.text).toContain("(FALLBACK)");
    // The variable narration stays in the user message (kept out of the cache prefix).
    expect(call.messages[0].content).toContain("ration card application");
    expect(call.messages[0].content).not.toContain("- rti_request: ");
  });

  it("hallucinated ids, API failures, and empty input all fall back to the generic petition", async () => {
    const hallucinated = await classifyLetter("ஏதோ ஒன்று", SEED_LETTER_TYPES, {
      client: reply('{"letterTypeId":"complaint_to_gods","language":null}'),
    });
    expect(hallucinated.letterTypeId).toBe(GENERIC_FALLBACK_ID);

    const down: LettersClient = {
      messages: { create: vi.fn(async () => { throw new Error("network down"); }) },
    };
    expect((await classifyLetter("உதவி வேணும்", SEED_LETTER_TYPES, { client: down })).letterTypeId).toBe(GENERIC_FALLBACK_ID);

    expect((await classifyLetter("   ", SEED_LETTER_TYPES)).letterTypeId).toBe(GENERIC_FALLBACK_ID);
  });

  it("captures an explicit language request", async () => {
    const r = await classifyLetter("RTI letter please, write it in English", SEED_LETTER_TYPES, {
      client: reply('{"letterTypeId":"rti_request","language":"en"}'),
    });
    expect(r.language).toBe("en");
  });
});
