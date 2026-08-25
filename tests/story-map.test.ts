import { describe, expect, it } from "vitest";
import { assertApprovedStoryMap, storyMapSchema } from "@/lib/story-map";

const validMap = {
  schema_version: "story_map.v1",
  story_map_id: "sm_test",
  status: "approved",
  narrative_weight: { past: 40, present: 60 },
  song_intent: "remember",
  current_state: { feeling: "quiet gratitude", intensity: 3 },
  relevant_past: "We cooked together on weekends and learned by trying again.",
  building_blocks: {
    central_relationship: "a close family relationship",
    central_place: "a familiar kitchen",
    central_memory: "laughing after a recipe went wrong",
    what_went_unsaid: "thank you for making ordinary time matter",
    change_over_time: "those ordinary afternoons feel more valuable now",
    chorus_message: "your steady care shaped me",
    final_detail: "one finished plate on the counter",
  },
  emotional_register: "quiet gratitude",
  exact_phrases_to_keep: ["take your time"],
  may_use: ["weekend cooking"],
  must_not_use: ["a private medical detail"],
  permissions: { names: false, places: false, explicit_language: false },
  point_of_view: "second",
  literalness: "balanced",
  interpretations: [
    { field: "building_blocks.chorus_message", basis: ["a4", "a6"], confidence: "high" },
  ],
} as const;

describe("story_map.v1", () => {
  it("accepts a complete approved Story Map", () => {
    expect(storyMapSchema.parse(validMap).schema_version).toBe("story_map.v1");
  });

  it("requires narrative weights to total 100", () => {
    expect(storyMapSchema.safeParse({ ...validMap, narrative_weight: { past: 60, present: 60 } }).success).toBe(false);
  });

  it("requires intensity from 1 to 5", () => {
    expect(storyMapSchema.safeParse({ ...validMap, current_state: { feeling: "quiet", intensity: 6 } }).success).toBe(false);
  });

  it("requires every building block to be nonblank and at most 40 words", () => {
    const blank = { ...validMap, building_blocks: { ...validMap.building_blocks, final_detail: "" } };
    const long = { ...validMap, building_blocks: { ...validMap.building_blocks, final_detail: "word ".repeat(41) } };
    expect(storyMapSchema.safeParse(blank).success).toBe(false);
    expect(storyMapSchema.safeParse(long).success).toBe(false);
  });

  it("rejects overlap between exact phrases and exclusions", () => {
    expect(storyMapSchema.safeParse({ ...validMap, must_not_use: ["TAKE YOUR TIME"] }).success).toBe(false);
  });

  it("blocks generation from an unapproved map", () => {
    const draft = storyMapSchema.parse({ ...validMap, status: "draft" });
    expect(() => assertApprovedStoryMap(draft)).toThrow(/approved/i);
  });
});
