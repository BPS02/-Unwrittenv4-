import { describe, expect, it } from "vitest";
import { SONGWRITING_CORE_PROMPT, SONGWRITING_CORE_VERSION } from "@/lib/songwriting-core";

describe("core.v1", () => {
  it("is explicitly versioned and owns the universal output contract", () => {
    expect(SONGWRITING_CORE_VERSION).toBe("core.v1");
    expect(SONGWRITING_CORE_PROMPT).toContain("TITLE, STYLE, and LYRICS");
    expect(SONGWRITING_CORE_PROMPT).toContain("must-not-use");
    expect(SONGWRITING_CORE_PROMPT).toContain("Never invent an event");
    expect(SONGWRITING_CORE_PROMPT).toContain("living artist");
  });

  it("contains no genre-specific structure, palette, or universal exclusions", () => {
    expect(SONGWRITING_CORE_PROMPT).not.toMatch(/mandatory pre-chorus/i);
    expect(SONGWRITING_CORE_PROMPT).not.toMatch(/final chorus/i);
    expect(SONGWRITING_CORE_PROMPT).not.toMatch(/fingerpicked|pedal steel|synth pads|EDM drops/i);
    expect(SONGWRITING_CORE_PROMPT).not.toMatch(/every bar.*rhyme/i);
  });
});
