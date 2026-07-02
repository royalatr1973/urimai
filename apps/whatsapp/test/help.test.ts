import { describe, it, expect } from "vitest";
import { isHelpRequest } from "../src/help.js";

describe("isHelpRequest", () => {
  it("detects English and Tamil help words", () => {
    expect(isHelpRequest("I need help")).toBe(true);
    expect(isHelpRequest("உதவி வேண்டும்")).toBe(true);
    expect(isHelpRequest("எனக்கு உதவ முடியுமா")).toBe(true);
    expect(isHelpRequest("please connect me to an operator")).toBe(true);
  });
  it("does not fire on an ordinary situation description", () => {
    expect(isHelpRequest("எனக்கு வயசு 67, விதவை")).toBe(false);
    expect(isHelpRequest("")).toBe(false);
  });
});
