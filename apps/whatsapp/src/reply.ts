/**
 * Tamil reply text for the voice channel. Questions are spoken verbatim from the
 * orchestrator's bilingual question (question.ta). Results get a short spoken Tamil summary
 * that the TTS reads out; the document cards (images) accompany the eligible ones.
 */
import type { Verdict } from "@urimai/types";

export interface SchemeName {
  nameTamil: string;
}

/** A concise spoken-Tamil summary of the verdicts. */
export function buildResultsSummaryTamil(
  verdicts: Verdict[],
  namesById: Record<string, SchemeName>,
): string {
  const name = (id: string) => namesById[id]?.nameTamil ?? id;
  const eligible = verdicts.filter((v) => v.status === "eligible");
  const notEligible = verdicts.filter((v) => v.status === "not_eligible");

  const parts: string[] = [];
  if (eligible.length > 0) {
    parts.push(`நீங்கள் ${eligible.map((v) => name(v.schemeId)).join(", ")} திட்டத்திற்கு தகுதி பெறுகிறீர்கள்.`);
    parts.push("தேவையான ஆவணங்களை படத்தில் காட்டியுள்ளேன்.");
  } else {
    parts.push("தற்போதைய தகவலின் படி, நீங்கள் எந்த திட்டத்திற்கும் தகுதி பெறவில்லை.");
  }
  if (notEligible.length > 0) {
    parts.push(`${notEligible.map((v) => name(v.schemeId)).join(", ")} திட்டத்திற்கு தகுதி இல்லை.`);
  }
  parts.push("மேலும் உதவி தேவைப்பட்டால், 'உதவி' என்று சொல்லுங்கள்.");
  return parts.join(" ");
}
