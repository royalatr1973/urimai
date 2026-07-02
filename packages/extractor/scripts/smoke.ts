/**
 * Live smoke test for the profile extractor (Phase 2 manual verification).
 *
 *   pnpm extract:smoke      # needs ANTHROPIC_API_KEY in .env
 *
 * Sends a couple of real Tamil/English situation strings to Claude and prints the
 * extracted profiles, so you can eyeball that the subtle cases behave. This calls the
 * real API and costs a few tokens. Not part of the automated suite.
 */
import { extractProfile } from "../src/index.js";

const samples = [
  // Tamil: widow, irregular daily-wage work, a TN district → has_regular_income should stay null,
  // is_tamil_nadu derived true.
  "எனக்கு வயசு 68, விதவை, மதுரையில் இருக்கேன். தினக்கூலி வேலை, சில நாள் மட்டும்தான் வேலை இருக்கும்.",
  // English: disability %, no regular income, a TN city.
  "I'm a 45-year-old man with 60% disability, living in Salem. I have no regular income.",
  // Mixed: individual monthly figure + wet land → must NOT become family annual income.
  "எனக்கு மாசம் 1200 ரூபா வருது, அரை ஏக்கர் நஞ்சை நிலம் இருக்கு.",
];

for (const text of samples) {
  console.log("\n--- input ---\n" + text);
  const profile = await extractProfile(text);
  console.log("--- profile ---");
  console.log(JSON.stringify(profile, null, 2));
}
