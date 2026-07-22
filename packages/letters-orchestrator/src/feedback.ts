/**
 * Coarse sentiment + rating from a user's free feedback ("how did you feel?"). Pure,
 * deterministic — the RAW text is always stored for a human to read; this bucket is
 * just for aggregation. Numbers arrive already as digits (the ASR transcript is
 * number-normalized upstream), so a spoken "ஐந்து" reads as "5".
 */
export interface FeedbackVerdict {
  sentiment: "positive" | "neutral" | "negative";
  rating: number | null; // 1–5 when the user gave a number
}

const NEGATIVE = [
  "மோசம்",
  "சரியில்லை",
  "சரியில்ல",
  "பிடிக்கல",
  "பிடிக்கவில்லை",
  "பயனில்லை",
  "பயனில்ல",
  "வேஸ்ட்",
  "குழப்பம்",
  "கஷ்டம்",
  "நல்லாயில்ல",
  "நல்லா இல்ல",
  "நல்லா இல்லை",
  "bad",
  "waste",
  "useless",
  "poor",
  "worst",
  "difficult",
  "confusing",
  "not good",
  "not helpful",
];

const POSITIVE = [
  "நல்ல",
  "நல்லா",
  "நன்று",
  "நன்றி",
  "சூப்பர்",
  "அருமை",
  "மகிழ்ச்சி",
  "சந்தோஷம்",
  "உதவி",
  "பயனுள்ள",
  "பயனுள்ளதா",
  "எளிது",
  "எளிமை",
  "super",
  "good",
  "nice",
  "great",
  "excellent",
  "helpful",
  "thanks",
  "thank",
  "useful",
  "easy",
  "happy",
];

const norm = (t: string) => (t ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** Extract a 1–5 rating if the feedback contains one (e.g. "5", "5/5", "rating 4"). */
function extractRating(t: string): number | null {
  const m = t.match(/\b([1-5])\b/);
  return m ? Number(m[1]) : null;
}

export function classifyFeedback(text: string): FeedbackVerdict {
  const t = norm(text);
  const rating = extractRating(t);

  // Negatives win over positives ("நல்லா இல்ல" = not good → negative), checked first.
  const isNeg = NEGATIVE.some((w) => t.includes(w));
  const isPos = !isNeg && POSITIVE.some((w) => t.includes(w));

  let sentiment: FeedbackVerdict["sentiment"] = "neutral";
  if (isNeg) sentiment = "negative";
  else if (isPos) sentiment = "positive";
  else if (rating !== null) sentiment = rating >= 4 ? "positive" : rating <= 2 ? "negative" : "neutral";

  return { sentiment, rating };
}
