import { describe, it, expect } from "vitest";
import { isHelpRequest, isResetRequest } from "../src/help.js";

describe("isResetRequest", () => {
  it("detects Tamil and English 'new person' phrasings", () => {
    expect(isResetRequest("புதிது")).toBe(true);
    expect(isResetRequest("அடுத்தது புது நபர்")).toBe(true);
    expect(isResetRequest("next person please")).toBe(true);
    expect(isResetRequest("start over")).toBe(true);
  });
  it("does not fire on ordinary sentences containing 'new'", () => {
    expect(isResetRequest("I have no new income this year")).toBe(false);
    expect(isResetRequest("I bought a new house")).toBe(false);
    expect(isResetRequest("எனக்கு வயசு 67, விதவை")).toBe(false);
  });
  it("treats a bare 'new'/'புது' (whole message) as a reset", () => {
    expect(isResetRequest("New")).toBe(true);
    expect(isResetRequest("new")).toBe(true);
    expect(isResetRequest("  NEW  ")).toBe(true);
    expect(isResetRequest("புது")).toBe(true);
    expect(isResetRequest("restart")).toBe(true);
  });
});

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
