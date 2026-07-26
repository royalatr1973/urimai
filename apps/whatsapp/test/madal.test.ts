import { describe, it, expect, vi } from "vitest";
import type { LetterTurnResult } from "@urimai/letters-orchestrator";
import type { LetterDraft } from "@urimai/types";
import { createMadalHandler } from "../src/madal.js";

const draft: LetterDraft = {
  letterTypeId: "civic_grievance",
  typeVersion: 1,
  senderBlock: "லட்சுமி",
  date: "19-07-2026",
  addresseeBlock: "ஆணையர்",
  subject: "சாக்கடை",
  salutation: "ஐயா,",
  bodyParagraphs: ["சாக்கடை ஓவர்ஃப்ளோ."],
  closing: "நன்றி.",
  signatureLine: "இப்படிக்கு,\nலட்சுமி",
  copyTo: null,
  language: "ta",
};

function makeHandler(over: Record<string, unknown> = {}) {
  const spoken: string[] = [];
  const orchestrator = {
    handleTurn: vi.fn<(s: string, t: string) => Promise<LetterTurnResult>>(),
    startSession: vi.fn(async (): Promise<LetterTurnResult> => ({ kind: "listen", prompt: { ta: "சொல்லுங்கள்", en: "Tell me" } })),
    resetSession: vi.fn(async () => {}),
  };
  const whatsapp = {
    downloadMedia: vi.fn(async () => Buffer.from("")),
    sendText: vi.fn(async (_to: string, _text: string) => {}),
    sendAudio: vi.fn(async () => {}),
    sendImage: vi.fn(async () => {}),
    sendDocument: vi.fn(async (_to: string, _doc: Buffer, _name: string, _mime: string, _cap?: string) => {}),
    sendInteractiveList: vi.fn(async (_to: string, _body: string, _btn: string, _rows: unknown[], _opts?: unknown) => {}),
  };
  const escalation = { enqueue: vi.fn(async () => {}) };
  const onComplete = vi.fn(async (_from: string) => {});
  const handler = createMadalHandler({
    orchestrator,
    whatsapp,
    speak: async (_to, tamil) => void spoken.push(tamil),
    escalation,
    makePdf: vi.fn(async () => Buffer.from("%PDF-fake")),
    makeDocx: vi.fn(async () => Buffer.from("PKfake")),
    onComplete,
    now: () => "2026-07-19T00:00:00Z",
    ...over,
  });
  return { handler, orchestrator, whatsapp, escalation, spoken, onComplete };
}

describe("Madal WhatsApp renderer", () => {
  it("speaks gap questions and read-back chunks in order, ending with the okay-or-change prompt", async () => {
    const { handler, orchestrator, spoken } = makeHandler();
    orchestrator.handleTurn.mockResolvedValue({
      kind: "readback",
      draft,
      chunks: ["பகுதி ஒன்று", "பகுதி இரண்டு"],
      revisions: 0,
      prompt: { ta: "சரியா?", en: "Okay?" },
      changedOnly: false,
    });
    await handler.handleText("911", "காமராஜர் தெரு");
    expect(orchestrator.handleTurn).toHaveBeenCalledWith("wa:911", "காமராஜர் தெரு");
    expect(spoken).toEqual(["பகுதி ஒன்று", "பகுதி இரண்டு", "சரியா?"]);
  });

  it("brief read-back speaks a summary + disclaimer, NOT the full letter chunks (Sarvam TTS saver)", async () => {
    const { handler, orchestrator, spoken } = makeHandler({ readbackBrief: true });
    orchestrator.handleTurn.mockResolvedValue({
      kind: "readback",
      draft: { ...draft, subject: "சாக்கடை", addresseeBlock: "ஆணையர்" },
      chunks: ["முழு கடிதம் பகுதி ஒன்று", "முழு கடிதம் பகுதி இரண்டு"],
      revisions: 0,
      prompt: { ta: "சரியா?", en: "Okay?" },
      changedOnly: false,
    });
    await handler.handleText("911", "சரி");
    const said = spoken.join(" ");
    expect(said).toContain("சாக்கடை"); // the summary names the subject
    expect(said).not.toContain("முழு கடிதம்"); // the full letter chunks are NOT spoken
    expect(said).toContain("AI"); // disclaimer spoken
    expect(said).toContain("சரியா?"); // still asks okay-or-change
  });

  it("deliver sends .pdf AND .docx, asks the user to review them, and does NOT close yet", async () => {
    const { handler, orchestrator, whatsapp, spoken, onComplete } = makeHandler();
    orchestrator.handleTurn.mockResolvedValue({
      kind: "deliver",
      draft,
      draftHash: "ab".repeat(32),
      revisions: 1,
      prompt: { ta: "PDF-ஐ சரிபார்க்கவும்", en: "Check the PDF" },
    });
    await handler.handleText("911", "சரி அனுப்புங்க");

    expect(spoken.join()).toContain("தயார்"); // "delivering" spoken
    const docCalls = whatsapp.sendDocument.mock.calls;
    expect(docCalls).toHaveLength(2);
    expect(docCalls[0]![1].toString()).toContain("%PDF");
    expect(docCalls[0]![2]).toBe("madal-letter.pdf");
    expect(docCalls[0]![4]).toContain("பெருவிரல்"); // thumb-impression instruction in the caption
    expect(docCalls[1]![2]).toBe("madal-letter.docx");
    expect(spoken.join()).toContain("PDF-ஐ சரிபார்க்கவும்"); // review prompt spoken after the docs
    expect(onComplete).not.toHaveBeenCalled(); // session stays open for the review
  });

  it("feedback_request sends a 5-star tappable list (best→worst) and keeps the session open", async () => {
    const { handler, orchestrator, whatsapp, spoken, onComplete } = makeHandler();
    orchestrator.handleTurn.mockResolvedValue({
      kind: "feedback_request",
      prompt: { ta: "இந்த சேவை எப்படி இருந்தது?", en: "How was this service?" },
    });
    await handler.handleText("911", "நன்றி");

    expect(spoken.join()).toContain("நட்சத்திர"); // spoken nudge points at the stars
    expect(whatsapp.sendInteractiveList).toHaveBeenCalledOnce();
    const [to, body, , rows] = whatsapp.sendInteractiveList.mock.calls[0]!;
    expect(to).toBe("911");
    expect(body).toContain("எப்படி இருந்தது"); // the orchestrator's prompt is the list body
    expect(rows.map((r: { id: string }) => r.id)).toEqual(["5", "4", "3", "2", "1"]); // digit ids feed the rating
    expect((rows as { title: string }[])[0]!.title).toBe("⭐⭐⭐⭐⭐");
    expect(onComplete).not.toHaveBeenCalled(); // still open — awaiting the tap
  });

  it("closed speaks the thank-you and frees the route", async () => {
    const { handler, orchestrator, spoken, onComplete } = makeHandler();
    orchestrator.handleTurn.mockResolvedValue({
      kind: "closed",
      prompt: { ta: "உங்கள் கருத்துக்கு நன்றி!", en: "Thanks for your feedback!" },
    });
    await handler.handleText("911", "நல்லா இருந்துச்சு");
    expect(spoken.join()).toContain("நன்றி");
    expect(onComplete).toHaveBeenCalledWith("911");
  });

  it("a failed document send tells the user to retry rather than silently dropping the letter", async () => {
    const { handler, orchestrator, whatsapp, onComplete } = makeHandler();
    orchestrator.handleTurn.mockResolvedValue({
      kind: "deliver",
      draft,
      draftHash: "ab".repeat(32),
      revisions: 0,
      prompt: { ta: "சரிபார்க்கவும்", en: "Check it" },
    });
    whatsapp.sendDocument.mockRejectedValueOnce(new Error("upload 500"));
    await handler.handleText("911", "சரி");
    expect(whatsapp.sendText.mock.calls.map((c) => c[1]).join()).toContain("மீண்டும்");
    expect(onComplete).not.toHaveBeenCalled(); // stays open so they can retry
  });

  it("'உதவி' escalates before any orchestration", async () => {
    const { handler, orchestrator, escalation, spoken } = makeHandler();
    await handler.handleText("911", "உதவி வேணும்");
    expect(escalation.enqueue).toHaveBeenCalledOnce();
    expect(orchestrator.handleTurn).not.toHaveBeenCalled();
    expect(spoken.join()).toContain("இ-சேவை");
  });

  it("the revision-cap escalation enqueues a ticket and offers both paths", async () => {
    const { handler, orchestrator, escalation, spoken } = makeHandler();
    orchestrator.handleTurn.mockResolvedValue({ kind: "escalate", reason: "revision_cap", revisions: 5 });
    await handler.handleText("911", "இன்னும் மாத்து");
    expect(escalation.enqueue).toHaveBeenCalledOnce();
    expect(spoken.join()).toContain("சரி"); // the door stays open to approve the last draft
  });
});
