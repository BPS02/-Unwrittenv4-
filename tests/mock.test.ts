import { describe, expect, it } from "vitest";
import { buildMockStylePrompt, extractAnchors, generateMockLyrics } from "@/lib/mock";
import { lyricsRequestSchema } from "@/lib/validation";
import { DEFAULT_CONTROLS } from "@/lib/types";

function makeRequest(overrides?: {
  thought?: string;
  feelings?: string[];
  variation?: number;
  structure?: string;
  keepClean?: boolean;
}) {
  return lyricsRequestSchema.parse({
    input: {
      thought:
        overrides?.thought ??
        "I keep thinking about the summer we drove to the coast with the windows down.",
      feelings: overrides?.feelings ?? ["nostalgic", "free"],
      feelingsText: "",
      context: "",
    },
    controls: {
      ...DEFAULT_CONTROLS,
      structure: overrides?.structure ?? DEFAULT_CONTROLS.structure,
      keepClean: overrides?.keepClean ?? true,
    },
    variation: overrides?.variation ?? 0,
  });
}

describe("generateMockLyrics", () => {
  it("is deterministic: identical input produces the identical song", () => {
    const a = generateMockLyrics(makeRequest());
    const b = generateMockLyrics(makeRequest());
    expect(a).toEqual(b);
  });

  it("produces a different take when variation changes", () => {
    const a = generateMockLyrics(makeRequest({ variation: 0 }));
    const b = generateMockLyrics(makeRequest({ variation: 1 }));
    expect(a.lyrics).not.toBe(b.lyrics);
  });

  it("includes section labels matching the requested structure", () => {
    const vc = generateMockLyrics(makeRequest({ structure: "Verse – Chorus" }));
    expect(vc.lyrics).toContain("[Verse 1]");
    expect(vc.lyrics).toContain("[Chorus]");
    expect(vc.lyrics).not.toContain("[Bridge]");

    const vcb = generateMockLyrics(makeRequest({ structure: "Verse – Chorus – Bridge" }));
    expect(vcb.lyrics).toContain("[Bridge]");

    const through = generateMockLyrics(
      makeRequest({ structure: "Through-composed (story)" })
    );
    expect(through.lyrics).toContain("[Verse 4]");
    expect(through.lyrics).not.toContain("[Chorus]");
  });

  it("weaves the user's feelings into the lyrics", () => {
    const song = generateMockLyrics(makeRequest({ feelings: ["weightless"] }));
    expect(song.lyrics.toLowerCase()).toContain("weightless");
  });

  it("has a non-empty title", () => {
    const song = generateMockLyrics(makeRequest());
    expect(song.title.trim().length).toBeGreaterThan(0);
  });

  it("scrubs explicit words from woven-in text when keepClean is on", () => {
    const song = generateMockLyrics(
      makeRequest({ thought: "I am so fucking tired of pretending it is fine", keepClean: true })
    );
    expect(song.lyrics.toLowerCase()).not.toContain("fucking");
  });

  it("works with no feelings at all (feelings are optional)", () => {
    const song = generateMockLyrics(makeRequest({ feelings: [] }));
    expect(song.lyrics).toContain("[");
    expect(song.title.length).toBeGreaterThan(0);
  });
});

describe("extractAnchors", () => {
  it("pulls short fragments from the thought", () => {
    const anchors = extractAnchors(
      "I keep thinking about the summer. We drove to the coast, windows down."
    );
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) {
      expect(a.split(" ").length).toBeLessThanOrEqual(10);
    }
  });

  it("returns an empty list for empty text", () => {
    expect(extractAnchors("")).toEqual([]);
  });
});

describe("buildMockStylePrompt", () => {
  it("mentions genre, mood, and title", () => {
    const prompt = buildMockStylePrompt({ title: "Porch Light", controls: DEFAULT_CONTROLS });
    expect(prompt).toContain(DEFAULT_CONTROLS.genre);
    expect(prompt.toLowerCase()).toContain(DEFAULT_CONTROLS.mood.toLowerCase());
    expect(prompt).toContain("Porch Light");
  });
});
