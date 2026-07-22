import { describe, expect, it } from "vitest";
import { classifyFeedback } from "../src/feedback.js";

describe("classifyFeedback", () => {
  it("reads warm Tamil praise as positive", () => {
    const v = classifyFeedback("ரொம்ப நல்லா இருந்துச்சு, உதவியா இருந்துச்சு");
    expect(v.sentiment).toBe("positive");
    expect(v.rating).toBeNull();
  });

  it("reads English praise as positive", () => {
    expect(classifyFeedback("very helpful, thanks").sentiment).toBe("positive");
  });

  it("lets a negation win over the positive stem it contains", () => {
    // 'நல்லா இல்ல' = 'not good' — must not be misread as positive on the 'நல்லா' stem.
    expect(classifyFeedback("நல்லா இல்ல").sentiment).toBe("negative");
    expect(classifyFeedback("not helpful at all").sentiment).toBe("negative");
  });

  it("captures a 1–5 rating and derives sentiment from it when no words apply", () => {
    expect(classifyFeedback("5")).toEqual({ sentiment: "positive", rating: 5 });
    expect(classifyFeedback("rating 4")).toEqual({ sentiment: "positive", rating: 4 });
    expect(classifyFeedback("2")).toEqual({ sentiment: "negative", rating: 2 });
    expect(classifyFeedback("3")).toEqual({ sentiment: "neutral", rating: 3 });
  });

  it("words win over a bare number when both appear", () => {
    // 'மோசம்' (bad) with a stray '4' — the sentiment word is authoritative.
    const v = classifyFeedback("4 நாள்ல மோசம் அனுபவம்");
    expect(v.sentiment).toBe("negative");
    expect(v.rating).toBe(4);
  });

  it("falls back to neutral on opaque input", () => {
    expect(classifyFeedback("ம்ம்").sentiment).toBe("neutral");
    expect(classifyFeedback("").sentiment).toBe("neutral");
  });
});
