import { describe, expect, it } from "vitest";
import { TEMPLATES, getTemplate, templatesByFamily } from "@/lib/templates";
import { FEELING_CHIPS, GENRES, MOODS, TEMPLATE_FAMILIES } from "@/lib/types";
import { SENTENCE_STARTERS } from "@/components/HomeEntry";

/**
 * The starter templates are fully hand-curated — no model writes any part of
 * them. Choosing one selects its feelings immediately and drops one of its
 * hand-written opening thoughts into the box, so these tests guard the shape
 * that makes that instant selection safe.
 */

describe("starter templates", () => {
  it("has unique ids", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(TEMPLATES.length);
  });

  it("each template has a theme, tagline, and at least two starter thoughts", () => {
    for (const t of TEMPLATES) {
      expect(t.theme.length).toBeGreaterThan(2);
      expect(t.tagline.length).toBeGreaterThan(2);
      // Two variants minimum, so picking the same template again reads
      // differently without any model involved.
      expect(t.starterThoughts.length).toBeGreaterThanOrEqual(2);
      for (const thought of t.starterThoughts) {
        expect(thought.length).toBeGreaterThan(40);
        // House style: unresolved, personal, never about music itself.
        expect(thought.toLowerCase()).not.toMatch(/\b(song|lyric|music|sing)\b/);
      }
    }
  });

  it("pre-selects feelings drawn only from FEELING_CHIPS, so the chips light up", () => {
    const chips = new Set<string>(FEELING_CHIPS);
    for (const t of TEMPLATES) {
      expect(t.feelings.length).toBeGreaterThanOrEqual(2);
      for (const feeling of t.feelings) {
        expect(chips.has(feeling), `${t.id}: "${feeling}" is not a FEELING_CHIP`).toBe(true);
      }
    }
  });

  it("belongs to a known emotion family, and every family has at least one template", () => {
    const families = new Set<string>(TEMPLATE_FAMILIES);
    for (const t of TEMPLATES) {
      expect(families.has(t.family), `${t.id}: unknown family "${t.family}"`).toBe(true);
    }
    for (const family of TEMPLATE_FAMILIES) {
      expect(
        TEMPLATES.some((t) => t.family === family),
        `family "${family}" has no templates`
      ).toBe(true);
    }
  });

  it("groups by family in TEMPLATE_FAMILIES order and covers every template", () => {
    const groups = templatesByFamily();
    expect(groups.map((g) => g.family)).toEqual([...TEMPLATE_FAMILIES]);
    const total = groups.reduce((n, g) => n + g.templates.length, 0);
    expect(total).toBe(TEMPLATES.length);
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

  it("does not overlap the home page sentence starters", () => {
    const themes = new Set(TEMPLATES.map((template) => template.theme.toLowerCase()));
    expect(SENTENCE_STARTERS.every((starter) => !themes.has(starter.toLowerCase()))).toBe(true);
  });
});
