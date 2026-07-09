import { describe, it, expect, vi } from "vitest";
import { SEED_SCHEMES } from "@urimai/db";
import type { TurnResult } from "@urimai/orchestrator";
import type { Verdict } from "@urimai/types";
import { createMessageHandler } from "../src/handler.js";
import type { SpeechProvider } from "../src/speech.js";
import type { WhatsAppClient } from "../src/whatsapp.js";

function fakeWhatsApp() {
  return {
    downloadMedia: vi.fn(async (_mediaId: string) => Buffer.from("OGG")),
    sendText: vi.fn(async (_to: string, _text: string) => {}),
    sendAudio: vi.fn(async (_to: string, _audio: Buffer, _mime?: string) => {}),
    sendImage: vi.fn(async (_to: string, _image: Buffer, _mime?: string, _caption?: string) => {}),
  } satisfies WhatsAppClient;
}

function fakeSpeech(): SpeechProvider & { transcribe: ReturnType<typeof vi.fn>; synthesize: ReturnType<typeof vi.fn> } {
  return {
    name: "fake",
    transcribe: vi.fn(async () => "transcribed tamil text"),
    synthesize: vi.fn(async () => ({ audio: Buffer.from("AUDIO"), mimeType: "audio/wav" })),
  };
}

const verdict = (schemeId: string, status: Verdict["status"]): Verdict => ({ schemeId, status, reasons: [], missingFields: [], ruleVersion: 1 });

const baseDeps = () => {
  const whatsapp = fakeWhatsApp();
  const speech = fakeSpeech();
  const orchestrator = {
    handleTurn: vi.fn<(sessionId: string, text: string) => Promise<TurnResult>>(),
    resetSession: vi.fn(async (_sessionId: string) => {}),
    // Default: continuing session (no opening disclaimer). Individual tests override for
    // the "first-ever contact" case.
    isNewSession: vi.fn(async (_sessionId: string) => false),
  };
  const escalation = { enqueue: vi.fn(async () => {}) };
  const transcode = vi.fn(async () => Buffer.from("WAV"));
  const deps = {
    orchestrator,
    speech,
    whatsapp,
    transcode,
    escalation,
    loadSchemes: async () => SEED_SCHEMES,
    // Hermetic card loader — tests must not read PNGs from disk.
    loadCardImage: vi.fn(async (_file: string) => Buffer.from("PNG")),
    now: () => "2026-01-01T00:00:00Z",
  };
  return { deps, whatsapp, speech, orchestrator, escalation, transcode };
};

describe("WhatsApp handler", () => {
  it("text → reuses orchestrator.handleTurn unchanged, speaks the question", async () => {
    const { deps, whatsapp, speech, orchestrator } = baseDeps();
    orchestrator.handleTurn.mockResolvedValue({
      kind: "question",
      field: "has_regular_income",
      question: { en: "Steady income?", ta: "நிலையான வருமானம் உள்ளதா?" },
      verdicts: [],
      profile: {} as never,
    });
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "text", text: "வயசு 67" });

    expect(orchestrator.handleTurn).toHaveBeenCalledWith("wa:9199", "வயசு 67");
    expect(speech.synthesize).toHaveBeenCalledWith("நிலையான வருமானம் உள்ளதா?", { targetLang: "ta-IN" });
    expect(whatsapp.sendAudio).toHaveBeenCalledOnce();
    expect(whatsapp.sendImage).not.toHaveBeenCalled();
  });

  it("audio → downloads, transcodes, transcribes, then orchestrates", async () => {
    const { deps, whatsapp, speech, transcode, orchestrator } = baseDeps();
    orchestrator.handleTurn.mockResolvedValue({ kind: "question", field: "age", question: { en: "Age?", ta: "வயது?" }, verdicts: [], profile: {} as never });
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "audio", mediaId: "M1" });

    expect(whatsapp.downloadMedia).toHaveBeenCalledWith("M1");
    expect(transcode).toHaveBeenCalledOnce();
    expect(speech.transcribe).toHaveBeenCalledOnce();
    expect(orchestrator.handleTurn).toHaveBeenCalledWith("wa:9199", "transcribed tamil text");
  });

  it("'help' short-circuits to escalation, never orchestrates", async () => {
    const { deps, orchestrator, escalation, whatsapp } = baseDeps();
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "text", text: "எனக்கு உதவி வேண்டும்" });

    expect(escalation.enqueue).toHaveBeenCalledWith({ from: "9199", text: "எனக்கு உதவி வேண்டும்", reason: "help_requested", at: "2026-01-01T00:00:00Z" });
    expect(orchestrator.handleTurn).not.toHaveBeenCalled();
    expect(whatsapp.sendAudio).toHaveBeenCalledOnce(); // spoken handoff
  });

  it("results (no rasterizer) → summary, TEXT document checklists, then ALL FOUR condition cards", async () => {
    const { deps, whatsapp, orchestrator } = baseDeps();
    orchestrator.handleTurn.mockResolvedValue({
      kind: "results",
      verdicts: [verdict("oldage", "eligible"), verdict("widow", "eligible"), verdict("kmut", "not_eligible"), verdict("disabled", "not_eligible")],
      profile: {} as never,
    });
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "text", text: "..." });

    expect(whatsapp.sendAudio).toHaveBeenCalledOnce(); // the spoken summary
    // Meta rejects SVG — without a rasterizer the 2 document checklists go as Tamil TEXT,
    // and the only images are the 4 condition-card PNGs (all schemes, curator decision).
    expect(whatsapp.sendImage).toHaveBeenCalledTimes(4);
    const mimes = whatsapp.sendImage.mock.calls.map((c) => c[2]);
    expect(mimes).toEqual(["image/png", "image/png", "image/png", "image/png"]);
    // 2 checklists + 1 cards lead-in.
    expect(whatsapp.sendText).toHaveBeenCalledTimes(3);
    expect(whatsapp.sendText.mock.calls[0]![1]).toContain("தேவையான ஆவணங்கள்");
    expect(whatsapp.sendText.mock.calls[1]![1]).toContain("தேவையான ஆவணங்கள்");
    expect(whatsapp.sendText.mock.calls[2]![1]).toContain("நான்கு திட்டங்களின்");
  });

  it("results (with rasterizer) → document cards go as rasterized PNG images", async () => {
    const { deps, whatsapp, orchestrator } = baseDeps();
    orchestrator.handleTurn.mockResolvedValue({
      kind: "results",
      verdicts: [verdict("oldage", "eligible"), verdict("widow", "not_eligible"), verdict("kmut", "not_eligible"), verdict("disabled", "not_eligible")],
      profile: {} as never,
    });
    const rasterize = vi.fn(async (_svg: string) => ({ bytes: Buffer.from("RASTER"), mimeType: "image/png" }));
    const h = createMessageHandler({ ...deps, rasterize });
    await h.handleInbound({ from: "9199", kind: "text", text: "..." });

    expect(rasterize).toHaveBeenCalledOnce();
    // 1 rasterized document card + 4 condition cards, no SVG anywhere.
    expect(whatsapp.sendImage).toHaveBeenCalledTimes(5);
    expect(whatsapp.sendImage.mock.calls.every((c) => c[2] === "image/png")).toBe(true);
  });

  it("a failed document checklist does not abort the reply — condition cards still go", async () => {
    const { deps, whatsapp, orchestrator } = baseDeps();
    orchestrator.handleTurn.mockResolvedValue({
      kind: "results",
      verdicts: [verdict("oldage", "eligible"), verdict("widow", "not_eligible"), verdict("kmut", "not_eligible"), verdict("disabled", "not_eligible")],
      profile: {} as never,
    });
    // The checklist text send fails (e.g. transient Meta error)…
    whatsapp.sendText.mockRejectedValueOnce(new Error("boom"));
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "text", text: "..." });
    // …but all four condition cards still arrive.
    expect(whatsapp.sendImage).toHaveBeenCalledTimes(4);
  });

  it("condition cards go out ONCE per session — repeat messages after results don't re-spam", async () => {
    const { deps, whatsapp, orchestrator } = baseDeps();
    orchestrator.handleTurn.mockResolvedValue({
      kind: "results",
      verdicts: [verdict("oldage", "eligible"), verdict("widow", "not_eligible"), verdict("kmut", "not_eligible"), verdict("disabled", "not_eligible")],
      profile: {} as never,
    });
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "text", text: "first results" });
    expect(whatsapp.sendImage).toHaveBeenCalledTimes(4); // the 4 condition cards

    await h.handleInbound({ from: "9199", kind: "text", text: "why?" });
    // Second results delivery: checklist text again, but NO condition cards re-sent.
    expect(whatsapp.sendImage).toHaveBeenCalledTimes(4);
  });

  it("'new person' reset makes the condition cards go out again for the next person", async () => {
    const { deps, whatsapp, orchestrator } = baseDeps();
    orchestrator.handleTurn.mockResolvedValue({
      kind: "results",
      verdicts: [verdict("oldage", "eligible"), verdict("widow", "not_eligible"), verdict("kmut", "not_eligible"), verdict("disabled", "not_eligible")],
      profile: {} as never,
    });
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "text", text: "first results" }); // 4 cards
    await h.handleInbound({ from: "9199", kind: "text", text: "புது நபர்" }); // reset
    await h.handleInbound({ from: "9199", kind: "text", text: "அவருக்கு வயசு 70" });
    // 4 (first person) + 4 (second person, cards re-sent after reset).
    expect(whatsapp.sendImage).toHaveBeenCalledTimes(8);
  });

  it("'new person' resets the session (shared phones must never merge profiles)", async () => {
    const { deps, orchestrator, whatsapp } = baseDeps();
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "text", text: "புது நபர்" });

    expect(orchestrator.resetSession).toHaveBeenCalledWith("wa:9199");
    expect(orchestrator.handleTurn).not.toHaveBeenCalled();
    expect(whatsapp.sendAudio).toHaveBeenCalledOnce(); // spoken confirmation
  });

  it("unsupported message kinds get a gentle text nudge, no orchestration", async () => {
    const { deps, whatsapp, orchestrator } = baseDeps();
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "other" });
    expect(whatsapp.sendText).toHaveBeenCalledOnce();
    expect(orchestrator.handleTurn).not.toHaveBeenCalled();
  });
});

describe("text-only mode (no speech provider configured)", () => {
  it("text in → orchestrates and replies with Tamil TEXT, not audio", async () => {
    const { deps, whatsapp, orchestrator } = baseDeps();
    orchestrator.handleTurn.mockResolvedValue({
      kind: "question",
      field: "age",
      question: { en: "Age?", ta: "உங்கள் வயது என்ன?" },
      verdicts: [],
      profile: {} as never,
    });
    const h = createMessageHandler({ ...deps, speech: null });
    await h.handleInbound({ from: "9199", kind: "text", text: "வணக்கம், விதவை" });

    expect(orchestrator.handleTurn).toHaveBeenCalledWith("wa:9199", "வணக்கம், விதவை");
    expect(whatsapp.sendText).toHaveBeenCalledWith("9199", "உங்கள் வயது என்ன?");
    expect(whatsapp.sendAudio).not.toHaveBeenCalled();
  });

  it("voice note in → polite 'please type' nudge, no crash, no orchestration", async () => {
    const { deps, whatsapp, orchestrator, transcode } = baseDeps();
    const h = createMessageHandler({ ...deps, speech: null });
    await h.handleInbound({ from: "9199", kind: "audio", mediaId: "M1" });

    expect(whatsapp.sendText).toHaveBeenCalledOnce();
    expect(transcode).not.toHaveBeenCalled();
    expect(orchestrator.handleTurn).not.toHaveBeenCalled();
  });
});

describe("opening disclaimer (first-ever contact)", () => {
  it("fires on a fresh session BEFORE the turn is processed, and only once", async () => {
    const { deps, whatsapp, speech, orchestrator } = baseDeps();
    orchestrator.isNewSession.mockResolvedValue(true); // fresh session
    orchestrator.handleTurn.mockResolvedValue({
      kind: "question",
      field: "age",
      question: { en: "Age?", ta: "உங்கள் வயது?" },
      verdicts: [],
      profile: {} as never,
    });
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "text", text: "வணக்கம்" });

    // Two spoken outputs, in order: disclaimer FIRST, then the orchestrator question.
    expect(speech.synthesize).toHaveBeenCalledTimes(2);
    const firstSpoken = speech.synthesize.mock.calls[0]![0] as string;
    // The disclaimer names Urimai as a helper (not government) and locates the authority.
    expect(firstSpoken).toContain("உதவி சேவை");
    expect(firstSpoken).toContain("அரசு அல்ல");
    expect(firstSpoken).toContain("இறுதி முடிவு");
    // Second spoken is the question.
    const secondSpoken = speech.synthesize.mock.calls[1]![0] as string;
    expect(secondSpoken).toBe("உங்கள் வயது?");
    // Both delivered as audio.
    expect(whatsapp.sendAudio).toHaveBeenCalledTimes(2);
  });

  it("does NOT fire on a continuing session (implicit consent from prior interaction)", async () => {
    const { deps, whatsapp, speech, orchestrator } = baseDeps();
    orchestrator.isNewSession.mockResolvedValue(false); // continuing session
    orchestrator.handleTurn.mockResolvedValue({
      kind: "question",
      field: "age",
      question: { en: "Age?", ta: "உங்கள் வயது?" },
      verdicts: [],
      profile: {} as never,
    });
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "text", text: "68" });

    // Only ONE spoken output — the question. Disclaimer skipped.
    expect(speech.synthesize).toHaveBeenCalledOnce();
    expect(whatsapp.sendAudio).toHaveBeenCalledOnce();
  });

  it("in text-only mode, the disclaimer is sent as Tamil text (not audio)", async () => {
    const { deps, whatsapp, orchestrator } = baseDeps();
    orchestrator.isNewSession.mockResolvedValue(true);
    orchestrator.handleTurn.mockResolvedValue({
      kind: "question",
      field: "age",
      question: { en: "Age?", ta: "வயது?" },
      verdicts: [],
      profile: {} as never,
    });
    const h = createMessageHandler({ ...deps, speech: null });
    await h.handleInbound({ from: "9199", kind: "text", text: "hi" });

    // sendText called at least twice: once for disclaimer, once for question.
    expect(whatsapp.sendText.mock.calls.length).toBeGreaterThanOrEqual(2);
    const disclaimer = whatsapp.sendText.mock.calls[0]![1] as string;
    expect(disclaimer).toContain("உதவி சேவை");
    expect(disclaimer).toContain("அரசு அல்ல");
  });
});
