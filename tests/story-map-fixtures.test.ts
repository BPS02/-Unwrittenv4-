import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { storyMapSchema } from "@/lib/story-map";

interface Fixture { tags: string[]; story_map: unknown; revision_request?: string; contradiction?: string; must_interrupt_before_songwriting?: boolean }

const main = JSON.parse(readFileSync(new URL("./fixtures/story-maps/story-maps.v1.json", import.meta.url), "utf8")) as Fixture[];
const safety = JSON.parse(readFileSync(new URL("./fixtures/story-maps/safety/immediate-danger.v1.json", import.meta.url), "utf8")) as Fixture;
const fixtures = [...main, safety];

describe("Story Map fixture set", () => {
  it("contains exactly 20 unique approved, schema-valid fictional maps", () => {
    expect(fixtures).toHaveLength(20);
    const parsed = fixtures.map((fixture) => storyMapSchema.parse(fixture.story_map));
    expect(new Set(parsed.map((map) => map.story_map_id)).size).toBe(20);
    expect(parsed.every((map) => map.status === "approved")).toBe(true);
  });

  it("covers every planned pressure-test category", () => {
    const tags = new Set(fixtures.flatMap((fixture) => fixture.tags));
    for (const required of [
      "celebratory", "sad_unresolved", "mixed_feelings", "transition", "relationship",
      "high_past", "balanced", "low_past", "must_not_use_from_answers", "name_allowed",
      "name_forbidden", "contradictory", "sparse", "solo_male", "solo_female", "duet",
      "country_folk", "pop", "hip_hop", "reggae", "clean_strong_emotion", "metaphorical",
      "revision", "safety_interrupt",
    ]) expect(tags.has(required), `missing fixture coverage: ${required}`).toBe(true);
  });

  it("keeps the immediate-danger fixture isolated and marked to interrupt", () => {
    expect(main.some((fixture) => fixture.tags.includes("safety_interrupt"))).toBe(false);
    expect(safety.must_interrupt_before_songwriting).toBe(true);
  });
});
