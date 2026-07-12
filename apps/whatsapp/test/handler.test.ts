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
    synthesize: vi.fn(async () => ({ audio: Buffer.from("AUDIO"), mimeType: "audio/mpeg" })),
  };
}

const verdict = (schemeId: string, status: Verdict["status"]): Verdict => ({ schemeId, status, reasons: [], missingFields: [], ruleVersion: 1 });

const baseDeps = () => {
  const whatsapp = fakeWhatsApp();
  const speech = fakeSpeech();
  const orchestrator = {
    handleTurn: vi.fn<(sessionId: string, text: string) => Promise<TurnResult>>(),
    resetSession: vi.fn(async (_sessionId: string) => {}),
    // Reset flow opens with the first question directly.
    startSession: vi.fn(async (_sessionId: string): Promise<TurnResult> => ({
      kind: "question",
      field: "age",
      question: { en: "How old are you?", ta: "உங்கள் வயதை தயவுசெய்து சொல்லுங்களேன்?" },
      verdicts: [],
      profile: {} as never,
      questionsAsked: 1,
    })),
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

    expect(whatsapp.sendAudio).toHaveBeenCalledOnce(); // the spoken summary — voice ONLY
    // Meta rejects SVG — without a rasterizer the 2 document checklists go as Tamil TEXT,
    // and the only images are the 4 condition-card PNGs (all schemes, curator decision).
    expect(whatsapp.sendImage).toHaveBeenCalledTimes(4);
    const mimes = whatsapp.sendImage.mock.calls.map((c) => c[2]);
    expect(mimes).toEqual(["image/png", "image/png", "image/png", "image/png"]);
    // Voice mode sends NO text duplicate of the summary: 2 checklists + 1 cards lead-in.
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
    whatsapp.sendText.mockImplementation(async (_to: string, text: string) => {
      if (text.includes("தேவையான ஆவணங்கள்")) throw new Error("boom");
    });
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "text", text: "..." });
    // …but all four condition cards still arrive.
    expect(whatsapp.sendImage).toHaveBeenCalledTimes(4);
  });

  it("voice-first: WAV TTS output is transcoded to OGG/Opus before sending", async () => {
    const { deps, whatsapp, speech, orchestrator } = baseDeps();
    speech.synthesize.mockResolvedValue({ audio: Buffer.from("WAV"), mimeType: "audio/wav" });
    orchestrator.handleTurn.mockResolvedValue({
      kind: "question", field: "age", question: { en: "Age?", ta: "வயது?" }, verdicts: [], profile: {} as never,
    });
    const transcodeOut = vi.fn(async (_wav: Buffer) => Buffer.from("OGG"));
    const h = createMessageHandler({ ...deps, transcodeOut });
    await h.handleInbound({ from: "9199", kind: "text", text: "வணக்கம்" });

    expect(transcodeOut).toHaveBeenCalledOnce();
    const [, bytes, mime] = whatsapp.sendAudio.mock.calls[0]!;
    expect((bytes as Buffer).toString()).toBe("OGG");
    expect(mime).toBe("audio/ogg");
  });

  it("voice failure degrades to text, never silence", async () => {
    const { deps, whatsapp, speech, orchestrator } = baseDeps();
    speech.synthesize.mockRejectedValue(new Error("TTS down"));
    orchestrator.handleTurn.mockResolvedValue({
      kind: "question", field: "age", question: { en: "Age?", ta: "வயது?" }, verdicts: [], profile: {} as never,
    });
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "text", text: "வணக்கம்" });

    // The Tamil text went out BEFORE synthesis was attempted; the failure is swallowed.
    expect(whatsapp.sendText).toHaveBeenCalledWith("9199", "வயது?");
    expect(whatsapp.sendAudio).not.toHaveBeenCalled();
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

  it("'new person' resets the session and opens DIRECTLY with the age question", async () => {
    const { deps, orchestrator, speech, whatsapp } = baseDeps();
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "text", text: "புது நபர்" });

    expect(orchestrator.resetSession).toHaveBeenCalledWith("wa:9199");
    expect(orchestrator.startSession).toHaveBeenCalledWith("wa:9199"); // arms pendingField for a bare "65"
    expect(orchestrator.handleTurn).not.toHaveBeenCalled();
    expect(whatsapp.sendAudio).toHaveBeenCalledOnce(); // ONE message: ack + first question
    const spoken = speech.synthesize.mock.calls[0]![0] as string;
    expect(spoken).toContain("புதிதாகத் தொடங்குகிறோம்");
    expect(spoken).toContain("வயதை"); // …ends by asking the age
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

describe("opening disclaimer + consent gate (first-ever contact)", () => {
  const ageQuestion = {
    kind: "question" as const,
    field: "age" as const,
    question: { en: "Age?", ta: "உங்கள் வயது?" },
    verdicts: [],
    profile: {} as never,
  };

  it("fresh session → disclaimer ends with the consent question and WAITS (no orchestration)", async () => {
    const { deps, speech, orchestrator } = baseDeps();
    orchestrator.isNewSession.mockResolvedValue(true);
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "text", text: "வணக்கம்" });

    // ONE spoken output: the disclaimer, naming Urimai a helper (not government),
    // locating the authority, and ASKING permission — no question yet.
    expect(speech.synthesize).toHaveBeenCalledOnce();
    const spoken = speech.synthesize.mock.calls[0]![0] as string;
    expect(spoken).toContain("உதவி சேவை");
    expect(spoken).toContain("அரசு அல்ல");
    expect(spoken).toContain("இறுதி முடிவு");
    expect(spoken).toContain("தயக்கமாக இருக்கலாம்"); // some questions may feel difficult
    expect(spoken).toContain("மதிப்பீட்டிற்கு மட்டுமே"); // used only for assessment
    expect(spoken).toContain("கேட்கலாமா"); // asks permission…
    expect(orchestrator.handleTurn).not.toHaveBeenCalled(); // …and waits
  });

  it("acceptance starts the questions, folding in anything said in the first message", async () => {
    const { deps, orchestrator } = baseDeps();
    orchestrator.isNewSession.mockResolvedValue(true);
    orchestrator.handleTurn.mockResolvedValue(ageQuestion);
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "text", text: "எனக்கு 67 வயது" }); // rich first message
    await h.handleInbound({ from: "9199", kind: "text", text: "சரி" }); // consent

    expect(orchestrator.handleTurn).toHaveBeenCalledOnce();
    // The volunteered facts from the first message are not lost.
    expect(orchestrator.handleTurn).toHaveBeenCalledWith("wa:9199", "எனக்கு 67 வயது சரி");
  });

  it("a whole-message 'வேண்டாம்' declines politely — still no questions", async () => {
    const { deps, speech, orchestrator } = baseDeps();
    orchestrator.isNewSession.mockResolvedValue(true);
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "text", text: "வணக்கம்" });
    await h.handleInbound({ from: "9199", kind: "text", text: "வேண்டாம்" });

    expect(orchestrator.handleTurn).not.toHaveBeenCalled();
    const lastSpoken = speech.synthesize.mock.calls.at(-1)![0] as string;
    expect(lastSpoken).toContain("பரவாயில்லை"); // polite exit
  });

  it("does NOT fire on a continuing session (consent already given)", async () => {
    const { deps, whatsapp, speech, orchestrator } = baseDeps();
    orchestrator.isNewSession.mockResolvedValue(false); // continuing session
    orchestrator.handleTurn.mockResolvedValue(ageQuestion);
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "text", text: "68" });

    // Only ONE spoken output — the question. Disclaimer skipped.
    expect(speech.synthesize).toHaveBeenCalledOnce();
    expect(whatsapp.sendAudio).toHaveBeenCalledOnce();
  });

  it("in text-only mode, the disclaimer is sent as Tamil text (not audio)", async () => {
    const { deps, whatsapp, orchestrator } = baseDeps();
    orchestrator.isNewSession.mockResolvedValue(true);
    const h = createMessageHandler({ ...deps, speech: null });
    await h.handleInbound({ from: "9199", kind: "text", text: "hi" });

    expect(whatsapp.sendText).toHaveBeenCalledOnce(); // the disclaimer alone; then it waits
    const disclaimer = whatsapp.sendText.mock.calls[0]![1] as string;
    expect(disclaimer).toContain("உதவி சேவை");
    expect(disclaimer).toContain("அரசு அல்ல");
    expect(disclaimer).toContain("கேட்கலாமா");
  });
});

describe("ASR failure resilience", () => {
  it("a voice note whose transcription fails gets the 'please type' nudge, not silence", async () => {
    const { deps, whatsapp, speech, orchestrator } = baseDeps();
    speech.transcribe.mockRejectedValue(new Error("out of credits"));
    const h = createMessageHandler(deps);
    await h.handleInbound({ from: "9199", kind: "audio", mediaId: "M1" });

    expect(whatsapp.sendText).toHaveBeenCalledOnce();
    expect(whatsapp.sendText.mock.calls[0]![1]).toContain("குரல்"); // the voice-not-ready nudge
    expect(orchestrator.handleTurn).not.toHaveBeenCalled();
  });
});

describe("question pacing and purpose lines", () => {
  const question = (over: Partial<{ purposeTa: string }> = {}, questionsAsked = 1): TurnResult => ({
    kind: "question",
    field: "annual_family_income",
    question: { en: "Income?", ta: "வருமானம் எவ்வளவு?", ...over },
    verdicts: [verdict("kmut", "need_info"), verdict("widow", "not_eligible")],
    profile: {} as never,
    questionsAsked,
  });

  it("delicate questions carry their purpose line before the question", async () => {
    const { deps, whatsapp, orchestrator } = baseDeps();
    orchestrator.handleTurn.mockResolvedValue(question({ purposeTa: "சில திட்டங்கள் குறைந்த வருமானக் குடும்பங்களுக்கு மட்டுமே — அதனால் கேட்கிறேன்." }));
    const h = createMessageHandler({ ...deps, speech: null }); // text mode to inspect the composed message
    await h.handleInbound({ from: "9199", kind: "text", text: "..." });

    const sent = whatsapp.sendText.mock.calls[0]![1] as string;
    expect(sent).toContain("அதனால் கேட்கிறேன்");
    expect(sent.indexOf("அதனால் கேட்கிறேன்")).toBeLessThan(sent.indexOf("வருமானம் எவ்வளவு?"));
  });

  it("prepends the progress recap before question 5 (after 4 answers), not before question 4", async () => {
    const { deps, whatsapp, orchestrator } = baseDeps();
    const h = createMessageHandler({ ...deps, speech: null }); // text mode to inspect the composed message

    orchestrator.handleTurn.mockResolvedValue(question({}, 4));
    await h.handleInbound({ from: "9199", kind: "text", text: "..." });
    expect(whatsapp.sendText.mock.calls[0]![1]).not.toContain("பொறுமையாக");

    orchestrator.handleTurn.mockResolvedValue(question({}, 5));
    await h.handleInbound({ from: "9199", kind: "text", text: "..." });
    const withRecap = whatsapp.sendText.mock.calls[1]![1] as string;
    expect(withRecap).toContain("பொறுமையாக"); // recap present…
    expect(withRecap).toContain("வருமானம் எவ்வளவு?"); // …followed by the question, one message
    // The message must END with the next question — recap first, question last.
    expect(withRecap.indexOf("பொறுமையாக")).toBeLessThan(withRecap.indexOf("வருமானம் எவ்வளவு?"));
    expect(withRecap.trim().endsWith("வருமானம் எவ்வளவு?")).toBe(true);
  });

  it("voice mode sends questions as voice ONLY — no duplicate text message", async () => {
    const { deps, whatsapp, orchestrator } = baseDeps();
    orchestrator.handleTurn.mockResolvedValue(question({}, 1));
    const h = createMessageHandler(deps); // speech configured
    await h.handleInbound({ from: "9199", kind: "text", text: "..." });

    expect(whatsapp.sendAudio).toHaveBeenCalledOnce();
    expect(whatsapp.sendText).not.toHaveBeenCalled();
  });

});
