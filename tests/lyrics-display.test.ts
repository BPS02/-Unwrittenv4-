import { describe, expect, it } from "vitest";
import { hasPerformanceTags, isVocable, lyricsForReading } from "@/lib/lyrics-display";

const RAW = [
  "[Intro, Quiet arrangement, Soft vinyl crackle]",
  "(Ahh ahh ahh)",
  "",
  "[Verse 1]",
  "There's boxes everywhere I look tonight",
  "Stacked up against the kitchen wall (Ahh ahh)",
  "",
  "[Chorus, Backing vocals]",
  "One more night in the old apartment",
  "And I never told you (I never told you)",
].join("\n");

describe("reading copy of the lyrics", () => {
  it("removes production markup but keeps every sung line", () => {
    expect(lyricsForReading(RAW)).toBe(
      [
        "There's boxes everywhere I look tonight",
        "Stacked up against the kitchen wall",
        "",
        "One more night in the old apartment",
        "And I never told you (I never told you)",
      ].join("\n")
    );
  });

  it("keeps a trailing parenthetical that is a real sung line", () => {
    expect(lyricsForReading("And I never told you (I never told you)")).toBe(
      "And I never told you (I never told you)"
    );
  });

  it("drops a whole-line parenthetical even when it uses real words", () => {
    // Observed in real output: a production direction, not a sung line.
    expect(lyricsForReading("(Fading synth pad, stripped-down echo)")).toBe("");
    expect(
      lyricsForReading("One last time\n(Fading synth pad, stripped-down echo)")
    ).toBe("One last time");
    expect(lyricsForReading("(Spoken)\nreal line")).toBe("real line");
  });

  it("drops parentheticals that are only vocables", () => {
    for (const ad of ["Ahh ahh ahh", "ooh ooh", "na na na", "la la la", "yeah yeah", "mmm", "whoa"]) {
      expect(isVocable(ad), ad).toBe(true);
      expect(lyricsForReading(`Hold on (${ad})`)).toBe("Hold on");
    }
  });

  it("does not collapse deliberate stanza breaks", () => {
    const out = lyricsForReading("line one\n\nline two");
    expect(out).toBe("line one\n\nline two");
  });

  it("never leaves a hole where a tag-only line was", () => {
    expect(lyricsForReading("[Bridge]\nreal line")).toBe("real line");
    expect(lyricsForReading("[Outro]")).toBe("");
  });

  it("is a no-op on lyrics that carry no markup", () => {
    const plain = "just words\nand more words";
    expect(lyricsForReading(plain)).toBe(plain);
    expect(hasPerformanceTags(plain)).toBe(false);
    expect(hasPerformanceTags(RAW)).toBe(true);
  });

  it("leaves the raw text untouched — it is what the provider receives", () => {
    const copy = RAW.slice();
    lyricsForReading(RAW);
    expect(RAW).toBe(copy);
  });
});
