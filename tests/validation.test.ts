import { describe, expect, it } from "vitest";
import {
  lyricsRequestSchema,
  musicRequestSchema,
  songInputSchema,
  firstIssueMessage,
} from "@/lib/validation";
import { DEFAULT_CONTROLS } from "@/lib/types";

const validInput = {
  thought: "I keep thinking about the summer we drove to the coast.",
  feelings: ["nostalgic"],
  feelingsText: "",
  context: "",
};

describe("songInputSchema", () => {
  it("accepts a valid input and trims whitespace", () => {
    const parsed = songInputSchema.parse({ ...validInput, thought: "  hello real world  " });
    expect(parsed.thought).toBe("hello real world");
  });

  it("rejects an empty thought", () => {
    const result = songInputSchema.safeParse({ ...validInput, thought: "   " });
    expect(result.success).toBe(false);
  });

  it("requires at least three words", () => {
    expect(songInputSchema.safeParse({ ...validInput, thought: "only two" }).success).toBe(false);
    expect(songInputSchema.safeParse({ ...validInput, thought: "these are three" }).success).toBe(true);
  });

  it("treats feelings as optional", () => {
    const parsed = songInputSchema.parse({ thought: "a real thought here" });
    expect(parsed.feelings).toEqual([]);
    expect(parsed.feelingsText).toBe("");
  });

  it("rejects an overlong thought", () => {
    const result = songInputSchema.safeParse({ ...validInput, thought: "x".repeat(2001) });
    expect(result.success).toBe(false);
  });
});

describe("lyricsRequestSchema", () => {
  it("accepts valid input + controls and defaults variation to 0", () => {
    const parsed = lyricsRequestSchema.parse({ input: validInput, controls: DEFAULT_CONTROLS });
    expect(parsed.variation).toBe(0);
    expect(parsed.controls.keepClean).toBe(true);
  });

  it("rejects an unknown genre", () => {
    const result = lyricsRequestSchema.safeParse({
      input: validInput,
      controls: { ...DEFAULT_CONTROLS, genre: "Polka Metal" },
    });
    expect(result.success).toBe(false);
  });
});

describe("musicRequestSchema", () => {
  it("requires lyrics of a sensible length", () => {
    const short = musicRequestSchema.safeParse({
      title: "A Song",
      lyrics: "too short",
      controls: DEFAULT_CONTROLS,
    });
    expect(short.success).toBe(false);

    const ok = musicRequestSchema.safeParse({
      title: "A Song",
      lyrics: "[Verse 1]\nThese are some real lyrics with enough length.",
      controls: DEFAULT_CONTROLS,
    });
    expect(ok.success).toBe(true);
  });
});

describe("firstIssueMessage", () => {
  it("produces a readable message with the field path", () => {
    const result = lyricsRequestSchema.safeParse({
      input: { ...validInput, thought: "" },
      controls: DEFAULT_CONTROLS,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = firstIssueMessage(result.error);
      expect(msg).toContain("input.thought");
    }
  });
});
