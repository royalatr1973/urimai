/**
 * Live smoke test for the letters classifier + fact extractor (Phase 2 manual
 * verification — the acceptance narrations from LETTERS_BRIEF §8):
 *
 *   pnpm --filter @urimai/letters-extractor letters:smoke   # needs ANTHROPIC_API_KEY
 *
 * Sends four real narrations (Tamil police complaint, English RTI, Tamil civic
 * grievance, something uncategorizable) through BOTH calls and prints the results for
 * eyeballing. Real API, a few tokens. Not part of the automated suite.
 */
import { SEED_LETTER_TYPES } from "@urimai/letter-types";
import { classifyLetter, extractLetterFacts } from "../src/index.js";

const samples: Array<{ label: string; text: string }> = [
  {
    label: "Tamil — police complaint (theft, prior visit, place + date)",
    text:
      "நேத்து ராத்திரி எங்க வீட்டுல திருட்டு நடந்துச்சு. என் பேரு முருகன், கடலூர் பழைய பஸ் ஸ்டாண்ட் பக்கத்துல குடியிருக்கேன். " +
      "தங்க செயின் ரெண்டும் எட்டாயிரம் ரூபா பணமும் போயிடுச்சு. காலைல ஸ்டேஷன் போனேன், எழுதி வாங்கலை. புகார் கடிதம் எழுதி தரணும்.",
  },
  {
    label: "English — RTI (pension application status, wants English)",
    text:
      "My name is R. Selvi from Tirunelveli. I applied for old age pension 8 months ago at the taluk office, acknowledgement number OAP/2025/4412, " +
      "but there is no reply. I want to ask under RTI what happened to my application. Please write the letter in English.",
  },
  {
    label: "Tamil — civic grievance (drainage overflow, three weeks)",
    text:
      "எங்க தெருவுல சாக்கடை மூணு வாரமா ஓவர்ஃப்ளோ ஆகுது. நடக்கவே முடியலை, பசங்க ஸ்கூல் போக சிரமம். " +
      "முனிசிபாலிட்டிக்கு கடிதம் எழுதணும். என் பேரு லட்சுமி, காமராஜர் தெரு, திண்டுக்கல்.",
  },
  {
    label: "Uncategorizable — vague need (should fall back to generic_petition)",
    text: "எனக்கு ஒரு உதவி வேணும், யார்கிட்ட சொல்றதுன்னு தெரியலை. வீட்டுல ரொம்ப கஷ்டம். ஏதாவது ஒரு கடிதம் எழுதி குடுங்க.",
  },
];

for (const s of samples) {
  console.log(`\n=== ${s.label} ===\n${s.text}`);
  const cls = await classifyLetter(s.text, SEED_LETTER_TYPES);
  console.log("--- classification ---");
  console.log(JSON.stringify(cls));
  const facts = await extractLetterFacts(s.text);
  console.log("--- facts ---");
  console.log(JSON.stringify(facts, null, 2));
}
