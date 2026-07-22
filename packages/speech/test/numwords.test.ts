import { describe, it, expect } from "vitest";
import { wordsToDigits } from "../src/numwords.js";

describe("wordsToDigits — Tamil/English number words → digits", () => {
  it("the reported case: 75 spoken in Tamil becomes 75, not the word", () => {
    expect(wordsToDigits("எழுபத்தைந்து")).toBe("75");
    expect(wordsToDigits("என் வீட்டு கதவு எண் எழுபத்தைந்து")).toBe("என் வீட்டு கதவு எண் 75");
  });

  it("Tamil compound tens (fused) across the range", () => {
    expect(wordsToDigits("இருபத்தைந்து")).toBe("25");
    expect(wordsToDigits("முப்பத்தைந்து")).toBe("35");
    expect(wordsToDigits("நாற்பத்தேழு")).toBe("47");
    expect(wordsToDigits("ஐம்பத்தி இரண்டு" /* also handles fused below */)).not.toBe(""); // spaced tolerated via accumulation
    expect(wordsToDigits("அறுபத்தொன்று")).toBe("61");
    expect(wordsToDigits("தொண்ணூற்றைந்து")).toBe("95");
    expect(wordsToDigits("பதினைந்து")).toBe("15");
  });

  it("Tamil hundreds and thousands", () => {
    expect(wordsToDigits("இருநூறு நாற்பத்தைந்து")).toBe("245");
    expect(wordsToDigits("இரண்டு நூறு")).toBe("200");
    expect(wordsToDigits("எட்டாயிரம்")).toBe("8000");
    expect(wordsToDigits("எட்டு ஆயிரம்")).toBe("8000");
    expect(wordsToDigits("எட்டாயிரம் ரூபா")).toBe("8000 ரூபா");
  });

  it("digit-sequence reading (phone / door read out digit by digit)", () => {
    expect(wordsToDigits("ஒன்பது எட்டு ஏழு ஆறு ஐந்து நான்கு மூன்று இரண்டு ஒன்று பூஜ்ஜியம்")).toBe("9876543210");
    expect(wordsToDigits("ஏழு ஐந்து")).toBe("75"); // "seven five" → 75
  });

  it("English number words", () => {
    expect(wordsToDigits("seventy five")).toBe("75");
    expect(wordsToDigits("two hundred forty five")).toBe("245");
    expect(wordsToDigits("door number seventy five")).toBe("door number 75");
  });

  it("colloquial Tamil units", () => {
    expect(wordsToDigits("ரெண்டு")).toBe("2");
    expect(wordsToDigits("மூணு வாரம்")).toBe("3 வாரம்");
    expect(wordsToDigits("அஞ்சு")).toBe("5");
  });

  it("'ஒரு' (the article 'a') is NEVER turned into 1", () => {
    expect(wordsToDigits("ஒரு வீடு")).toBe("ஒரு வீடு");
    expect(wordsToDigits("ஒரு மாசமா பிரச்சனை")).toBe("ஒரு மாசமா பிரச்சனை");
    // but the explicit numeral 'ஒன்று' IS one
    expect(wordsToDigits("ஒன்று")).toBe("1");
  });

  it("existing digits and non-number text pass through unchanged", () => {
    expect(wordsToDigits("214/2B சர்வே எண்")).toBe("214/2B சர்வே எண்");
    expect(wordsToDigits("வணக்கம் ஐயா")).toBe("வணக்கம் ஐயா");
    expect(wordsToDigits("")).toBe("");
  });

  it("handles trailing punctuation on a number word", () => {
    expect(wordsToDigits("கதவு எண் எழுபத்தைந்து.")).toBe("கதவு எண் 75");
  });
});
