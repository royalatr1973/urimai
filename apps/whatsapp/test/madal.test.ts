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

function makeHandler() {
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

  it("closed speaks the thank-you and frees the route", async () => {
    const { handler, orchestrator, spoken, onComplete } = makeHandler();
    orchestrator.handleTurn.mockResolvedValue({
      kind: "closed",
      draft,
      draftHash: "ab".repeat(32),
      prompt: { ta: "உங்கள் கடிதம் தயார்! நன்றி!", en: "Your letter is ready! Thanks!" },
    });
    await handler.handleText("911", "நன்றி");
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
