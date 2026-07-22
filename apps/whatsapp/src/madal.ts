/**
 * The Madal (letters) turn renderer for WhatsApp — the channel side of LETTERS_BRIEF
 * §7 steps 2–7. Normalized text goes into the channel-agnostic letters orchestrator
 * UNCHANGED; its TurnResult is rendered back as Tamil voice notes, and on approval as
 * .pdf + .docx WhatsApp documents with a spoken + written what-to-do-next caption.
 *
 * "help" escalates to a human before any orchestration, exactly like the Urimai side.
 */
import type { EscalationQueue } from "@urimai/escalation";
import { isHelpRequest } from "@urimai/escalation";
import type { LetterTurnResult } from "@urimai/letters-orchestrator";
import type { LetterDraft } from "@urimai/types";
import type { ListRow, WhatsAppClient } from "@urimai/whatsapp-client";

/** The slice of the letters orchestrator the channel uses — reused, not modified. */
export interface LettersOrchestratorLike {
  handleTurn(sessionId: string, text: string): Promise<LetterTurnResult>;
  startSession(sessionId: string): Promise<LetterTurnResult>;
  resetSession(sessionId: string): Promise<void>;
}

export interface MadalHandlerDeps {
  orchestrator: LettersOrchestratorLike;
  whatsapp: WhatsAppClient;
  speak: (to: string, tamil: string) => Promise<void>;
  escalation: EscalationQueue;
  /** LetterDraft → document bytes. Injected so tests need no Chromium/Word tooling. */
  makePdf: (draft: LetterDraft) => Promise<Buffer>;
  makeDocx: (draft: LetterDraft) => Promise<Buffer>;
  /** Called when a letter completes (approval + delivery) — the router clears the route. */
  onComplete?: (from: string) => Promise<void>;
  now?: () => string;
  helplineText?: string;
}

/** The five star-rating rows (best → worst). ids "5".."1" flow straight into the
 *  letters feedback phase, which reads the digit as the rating. */
const STAR_ROWS: ListRow[] = [
  { id: "5", title: "⭐⭐⭐⭐⭐", description: "மிகச் சிறந்தது" },
  { id: "4", title: "⭐⭐⭐⭐", description: "நன்று" },
  { id: "3", title: "⭐⭐⭐", description: "பரவாயில்லை" },
  { id: "2", title: "⭐⭐", description: "மோசம்" },
  { id: "1", title: "⭐", description: "மிகவும் மோசம்" },
];

const MSG = {
  handoff: "நேரடி உதவிக்கு, உங்கள் அருகிலுள்ள இ-சேவை மையம் அல்லது வட்டாட்சியர் அலுவலகத்தை அணுகவும்.",
  // Spoken after approval, before the documents arrive.
  delivering: "உங்கள் கடிதம் தயார். இப்போது PDF மற்றும் Word கோப்புகளாக அனுப்புகிறேன்.",
  docCaption:
    "உங்கள் கடிதம் ✅ பிரிண்ட் எடுத்து, கீழே கையொப்பம் அல்லது இடது பெருவிரல் ரேகை வைத்து, சம்பந்தப்பட்ட அலுவலகத்தில் கொடுங்கள். " +
    "(இது AI உதவியுடன் தயாரிக்கப்பட்டது — அனுப்பும் முன் விவரங்களைச் சரிபார்க்கவும்.)",
  // Spoken nudge alongside the star buttons — the audience is voice-first, so we say
  // "tap the stars below" rather than leaving a low-literacy user to read it.
  feedbackNudge: "இந்தச் சேவை உங்களுக்கு எப்படி இருந்தது? கீழே உள்ள நட்சத்திரங்களைத் தட்டி மதிப்பிடுங்கள்.",
  feedbackButton: "மதிப்பிடுங்கள்",
  feedbackSection: "நட்சத்திர மதிப்பீடு",
  // Revision cap reached: offer the human path but keep the door open to approve.
  escalateOffer:
    "பல முறை மாற்றியும் சரியாக அமையவில்லை போலிருக்கிறது. நேரடி உதவிக்கு அருகிலுள்ள இ-சேவை மையத்தை அணுகலாம்; அல்லது கடைசி கடிதம் சரியென்றால் 'சரி' என்று சொல்லுங்கள்.",
  deliveryFailed: "கோப்புகளை அனுப்புவதில் சிக்கல் — சிறிது நேரம் கழித்து 'சரி' என்று மீண்டும் சொல்லுங்கள்.",
};

export function createMadalHandler(deps: MadalHandlerDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const sessionId = (from: string) => `wa:${from}`;

  async function renderResult(from: string, r: LetterTurnResult): Promise<void> {
    switch (r.kind) {
      case "listen":
        await deps.speak(from, r.prompt.ta);
        return;
      case "confirm_type":
        await deps.speak(from, r.prompt.ta);
        return;
      case "question":
      case "entity_question":
        await deps.speak(from, r.question.ta);
        return;
      case "clarify":
        await deps.speak(from, r.prompt.ta);
        return;
      case "readback":
        // The full letter, spoken in TTS-safe chunks, then the change-or-okay question.
        for (const chunk of r.chunks) await deps.speak(from, chunk);
        await deps.speak(from, r.prompt.ta);
        return;
      case "deliver": {
        // Send the documents, then ASK the user to review them (session stays open for
        // a post-delivery correction). A delivery failure must NOT silently drop the
        // letter — tell them to retry rather than losing it.
        await deps.speak(from, MSG.delivering);
        try {
          const [pdf, docx] = [await deps.makePdf(r.draft), await deps.makeDocx(r.draft)];
          await deps.whatsapp.sendDocument(from, pdf, "madal-letter.pdf", "application/pdf", MSG.docCaption);
          await deps.whatsapp.sendDocument(
            from,
            docx,
            "madal-letter.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          );
          await deps.speak(from, r.prompt.ta); // "check the PDF — okay, or any change?"
        } catch (err) {
          console.error("[madal] document delivery failed:", err instanceof Error ? err.message : err);
          await deps.whatsapp.sendText(from, MSG.deliveryFailed);
        }
        return; // NOT complete — awaiting the user's review of the documents
      }
      case "feedback_request":
        // Documents accepted — ask for a rating via tappable stars (session stays open).
        // A short spoken nudge first (voice-first audience), then the 5-star list. A
        // tapped star returns as text "1".."5" and drives the orchestrator feedback phase;
        // a typed/spoken reply still works as before. Never let a send failure strand the
        // letter — the feedback step is optional, so just close-worthy silence is fine.
        await deps.speak(from, MSG.feedbackNudge);
        try {
          await deps.whatsapp.sendInteractiveList(from, r.prompt.ta, MSG.feedbackButton, STAR_ROWS, {
            sectionTitle: MSG.feedbackSection,
          });
        } catch (err) {
          console.error("[madal] feedback list send failed:", err instanceof Error ? err.message : err);
        }
        return;
      case "closed":
        // Feedback captured (or done) — close warmly and free the route for the next letter.
        await deps.speak(from, r.prompt.ta);
        await deps.onComplete?.(from);
        return;
      case "escalate":
        await deps.escalation.enqueue({ from, text: `[madal] revision cap reached (${r.revisions})`, reason: "help_requested", at: now() });
        if (deps.helplineText) await deps.whatsapp.sendText(from, deps.helplineText);
        await deps.speak(from, MSG.escalateOffer);
        return;
    }
  }

  /** Drive one Madal turn from normalized text (the router owns normalization). */
  async function handleText(from: string, text: string): Promise<void> {
    if (isHelpRequest(text)) {
      await deps.escalation.enqueue({ from, text, reason: "help_requested", at: now() });
      if (deps.helplineText) await deps.whatsapp.sendText(from, deps.helplineText);
      await deps.speak(from, MSG.handoff);
      return;
    }
    await renderResult(from, await deps.orchestrator.handleTurn(sessionId(from), text));
  }

  /** Open the letters flow with the §7.2 listen prompt (no user text consumed). */
  async function start(from: string): Promise<void> {
    await renderResult(from, await deps.orchestrator.startSession(sessionId(from)));
  }

  async function reset(from: string): Promise<void> {
    await deps.orchestrator.resetSession(sessionId(from));
  }

  return { handleText, start, reset };
}

export type MadalHandler = ReturnType<typeof createMadalHandler>;
