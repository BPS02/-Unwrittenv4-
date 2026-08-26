import { describe, expect, it } from "vitest";
import { assessSongQuality, type SongQualityReview } from "@/lib/song-quality-review";

function review(scores: SongQualityReview["scores"]): SongQualityReview {
  return { version: "quality-review.v1", storyMapId: "sm_test", scores, notes: [] };
}

describe("quality-review.v1", () => {
  it("passes only a strong human review", () => {
    expect(assessSongQuality(review({ story_fidelity: 5, personal_specificity: 4, verse_progression: 4, chorus_strength: 4, natural_language: 4, singability: 4, production_brief: 4 }))).toEqual({ passed: true, average: 4.14, reasons: [] });
  });

  it("blocks a polished song that is not faithful to the writer", () => {
    const result = assessSongQuality(review({ story_fidelity: 2, personal_specificity: 5, verse_progression: 5, chorus_strength: 5, natural_language: 5, singability: 5, production_brief: 5 }));
    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/fidelity/i);
  });

  it("rejects scores outside the human rubric", () => {
    expect(() => assessSongQuality(review({ story_fidelity: 6, personal_specificity: 4, verse_progression: 4, chorus_strength: 4, natural_language: 4, singability: 4, production_brief: 4 }))).toThrow(/1 to 5/);
  });
});
