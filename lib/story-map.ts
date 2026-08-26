import { z } from "zod";

export const STORY_MAP_SCHEMA_VERSION = "story_map.v1" as const;

const shortText = (maxWords: number) =>
  z.string().trim().min(1).refine(
    (value) => value === "none" || value.split(/\s+/).filter(Boolean).length <= maxWords,
    `Must be "none" or ${maxWords} words or fewer.`
  );

export const storyMapObjectSchema = z.object({
    schema_version: z.literal(STORY_MAP_SCHEMA_VERSION),
    story_map_id: z.string().regex(/^sm_[A-Za-z0-9_-]+$/),
    status: z.enum(["draft", "approved"]),
    narrative_weight: z.object({
      past: z.number().int().min(0).max(100),
      present: z.number().int().min(0).max(100),
    }),
    song_intent: z.enum(["celebrate", "resolve", "remember", "question", "let_go", "leave_unresolved"]),
    current_state: z.object({
      feeling: shortText(8),
      intensity: z.number().int().min(1).max(5),
    }),
    relevant_past: shortText(100),
    building_blocks: z.object({
      central_relationship: shortText(40),
      central_place: shortText(40),
      central_memory: shortText(40),
      what_went_unsaid: shortText(40),
      change_over_time: shortText(40),
      chorus_message: shortText(40),
      final_detail: shortText(40),
    }),
    emotional_register: shortText(2),
    exact_phrases_to_keep: z.array(z.string().trim().min(1).max(240)).max(12),
    may_use: z.array(z.string().trim().min(1).max(240)).max(30),
    must_not_use: z.array(z.string().trim().min(1).max(240)).max(30),
    permissions: z.object({
      names: z.boolean(),
      places: z.boolean(),
      explicit_language: z.boolean(),
    }),
    point_of_view: z.enum(["first", "second", "third"]),
    literalness: z.enum(["literal", "balanced", "metaphorical"]),
    interpretations: z
      .array(
        z.object({
          field: z.enum([
            "building_blocks.what_went_unsaid",
            "building_blocks.change_over_time",
            "building_blocks.chorus_message",
          ]),
          basis: z.array(z.string().trim().min(1).max(32)).min(1).max(12),
          confidence: z.enum(["low", "medium", "high"]),
        })
      )
      .max(12)
      .optional(),
  });

export const storyMapSchema = storyMapObjectSchema.superRefine((map, ctx) => {
    if (map.narrative_weight.past + map.narrative_weight.present !== 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["narrative_weight"],
        message: "Past and present weights must total 100.",
      });
    }

    const kept = new Set(map.exact_phrases_to_keep.map(normalize));
    for (const excluded of map.must_not_use) {
      if (kept.has(normalize(excluded))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["must_not_use"],
          message: "A detail cannot be both required and excluded.",
        });
      }
    }
  });

export type StoryMapV1 = z.infer<typeof storyMapSchema>;

export function assertApprovedStoryMap(map: StoryMapV1): StoryMapV1 {
  if (map.status !== "approved") throw new Error("Story Map must be approved before generation.");
  return map;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}
