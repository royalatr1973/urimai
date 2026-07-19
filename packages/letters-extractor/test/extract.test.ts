import { describe, it, expect, vi } from "vitest";
import type { LettersClient } from "../src/client.js";
import { extractLetterFacts } from "../src/extract.js";

const reply = (text: string): LettersClient => ({
  messages: { create: vi.fn(async () => ({ content: [{ type: "text", text }] })) },
});

describe("extractLetterFacts", () => {
  it("returns validated facts from a clean reply", async () => {
    const f = await extractLetterFacts("என் பேரு சாந்தி, சேலத்துல இருக்கேன், மூணு மாசமா சம்பளம் வரலை", {
      client: reply('{"sender_name":"சாந்தி","incident_place":"சேலம்","incident_details":"மூணு மாசமா சம்பளம் வரலை"}'),
    });
    expect(f.sender_name).toBe("சாந்தி");
    expect(f.incident_details).toContain("சம்பளம்");
  });

  it("passes the pending-fact context so a bare reply lands on the asked key", async () => {
    const client = reply('{"sender_phone":"9876543210"}');
    await extractLetterFacts("9876543210", { client, pendingFact: "sender_phone" });
    const call = (client.messages.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.messages[0].content).toContain('asked the user for "sender_phone"');
  });

  it("omits the context block when no fact is pending", async () => {
    const client = reply("{}");
    await extractLetterFacts("வணக்கம்", { client });
    const call = (client.messages.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.messages[0].content).not.toContain("Context for this reply");
  });

  it("API failure, junk output, and empty input never crash — empty facts instead", async () => {
    const down: LettersClient = {
      messages: { create: vi.fn(async () => { throw new Error("out of credits"); }) },
    };
    expect(await extractLetterFacts("ஏதோ", { client: down })).toEqual({ letterTypeId: null, language: null });

    expect(await extractLetterFacts("ஏதோ", { client: reply("I refuse to answer in JSON") })).toEqual({
      letterTypeId: null,
      language: null,
    });

    expect(await extractLetterFacts("")).toEqual({ letterTypeId: null, language: null });
  });
});
