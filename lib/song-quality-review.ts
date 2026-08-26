export const SONG_QUALITY_REVIEW_VERSION = "quality-review.v1" as const;

export const SONG_QUALITY_CRITERIA = [
  "story_fidelity",
  "personal_specificity",
  "verse_progression",
  "chorus_strength",
  "natural_language",
  "singability",
  "production_brief",
] as const;

export type SongQualityCriterion = (typeof SONG_QUALITY_CRITERIA)[number];

export interface SongQualityReview {
  version: typeof SONG_QUALITY_REVIEW_VERSION;
  storyMapId: string;
  scores: Record<SongQualityCriterion, number>;
  notes: string[];
}

export interface SongQualityDecision {
  passed: boolean;
  average: number;
  reasons: string[];
}

/** Human-review gate: no criterion below 3, average at least 4, fidelity at least 4. */
export function assessSongQuality(review: SongQualityReview): SongQualityDecision {
  const invalid = SONG_QUALITY_CRITERIA.filter((key) => !Number.isInteger(review.scores[key]) || review.scores[key] < 1 || review.scores[key] > 5);
  if (invalid.length) throw new Error(`Quality scores must be integers from 1 to 5: ${invalid.join(", ")}`);
  const average = SONG_QUALITY_CRITERIA.reduce((total, key) => total + review.scores[key], 0) / SONG_QUALITY_CRITERIA.length;
  const reasons: string[] = [];
  for (const key of SONG_QUALITY_CRITERIA) if (review.scores[key] < 3) reasons.push(`${key} scored below 3.`);
  if (review.scores.story_fidelity < 4) reasons.push("Story fidelity must score at least 4.");
  if (average < 4) reasons.push("Average quality score must be at least 4.0.");
  return { passed: reasons.length === 0, average: Math.round(average * 100) / 100, reasons };
}
