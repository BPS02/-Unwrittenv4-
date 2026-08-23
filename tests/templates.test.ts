import { describe, expect, it } from "vitest";
import { TEMPLATES, getTemplate } from "@/lib/templates";
import { GENRES, MOODS } from "@/lib/types";
import { SENTENCE_STARTERS } from "@/components/HomeEntry";

describe("starter templates", () => {
  it("has exactly 10 templates", () => {
    expect(TEMPLATES).toHaveLength(10);
  });

  it("has unique ids", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(TEMPLATES.length);
  });

  it("each template has a theme, starter thought, and feelings", () => {
    for (const t of TEMPLATES) {
      expect(t.theme.length).toBeGreaterThan(2);
      expect(t.starterThought.length).toBeGreaterThan(20);
      expect(t.feelings.length).toBeGreaterThanOrEqual(1);
      expect(t.tagline.length).toBeGreaterThan(2);
    }
  });

  it("suggested controls reference valid genres and moods", () => {
    for (const t of TEMPLATES) {
      if (t.suggested?.genre) expect(GENRES).toContain(t.suggested.genre);
      if (t.suggested?.mood) expect(MOODS).toContain(t.suggested.mood);
    }
  });

  it("looks templates up by id", () => {
    expect(getTemplate("letting-go")?.theme).toBe("Letting go");
    expect(getTemplate("nope")).toBeUndefined();
  });

  it("uses the required themes without overlapping sentence starters", () => {
    expect(TEMPLATES.map((template) => template.theme)).toEqual([
      "Someone I miss", "Starting over", "Something I never said",
      "A memory I can’t forget", "Where I am in life", "Letting go",
      "Quiet gratitude", "Falling for someone", "Finding my confidence",
      "A dream I’m still chasing",
    ]);
    const themes = new Set(TEMPLATES.map((template) => template.theme.toLowerCase()));
    expect(SENTENCE_STARTERS.every((starter) => !themes.has(starter.toLowerCase()))).toBe(true);
  });
});
