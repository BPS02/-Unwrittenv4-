import { describe, expect, it } from "vitest";
import { detectCrisisLanguage } from "@/lib/crisis";

describe("detectCrisisLanguage", () => {
  it("detects explicit crisis language", () => {
    expect(detectCrisisLanguage("sometimes I think about killing myself")).toBe(true);
    expect(detectCrisisLanguage("I don't want to be alive anymore", "")).toBe(true);
    expect(detectCrisisLanguage("I've been thinking about self-harm again")).toBe(true);
    expect(detectCrisisLanguage("no reason to keep going")).toBe(true);
  });

  it("does not flag ordinary sadness, grief, or heartbreak", () => {
    expect(detectCrisisLanguage("I am so sad and heartbroken since she left")).toBe(false);
    expect(detectCrisisLanguage("I miss my grandmother every single day")).toBe(false);
    expect(detectCrisisLanguage("this job is killing me softly", "I feel dead tired")).toBe(false);
    expect(detectCrisisLanguage("I want to end this chapter and start fresh")).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(detectCrisisLanguage("", "", "")).toBe(false);
  });

  it("checks across multiple fields", () => {
    expect(detectCrisisLanguage("a normal thought", "I want to hurt myself")).toBe(true);
  });
});
