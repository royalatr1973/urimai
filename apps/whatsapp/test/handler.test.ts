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

  it("results → speaks a summary and sends one document card per eligible scheme", async () => {
    const { deps, whatsapp, orchestrator } = baseDeps();
    orchestrator.handleTurn.mockResolvedValue({
      kind: "results",
      verdicts: [verdict("oldage", "eligible"), verdict("widow", "eligible"), verdict("kmut", "not_eligible"), verdict("disabled", "not_eligible")],
      profile: {} as never,
    });
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "text", text: "..." });

    expect(whatsapp.sendAudio).toHaveBeenCalledOnce(); // the spoken summary
    expect(whatsapp.sendImage).toHaveBeenCalledTimes(2); // one card per eligible scheme
    const [, bytes, mime] = whatsapp.sendImage.mock.calls[0]!;
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(mime).toBe("image/svg+xml");
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
