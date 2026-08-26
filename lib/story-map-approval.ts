import { storyMapSchema, type StoryMapV1 } from "./story-map";
import type { StoryMapExtractionFlag } from "./story-map-extraction";

export const STORY_MAP_APPROVAL_VERSION = "story-approval.v1" as const;

export function approveStoryMap(
  draft: StoryMapV1,
  unresolvedFlags: StoryMapExtractionFlag[] = []
): StoryMapV1 {
  if (draft.status !== "draft") throw new Error("Only a draft Story Map can be approved.");
  if (unresolvedFlags.some((flag) => flag.type === "contradiction")) {
    throw new Error("Resolve contradictory answers before approving the Story Map.");
  }
  return storyMapSchema.parse({ ...draft, status: "approved" });
}

export function updateStoryMapText(
  map: StoryMapV1,
  field: keyof StoryMapV1["building_blocks"],
  value: string
): StoryMapV1 {
  return storyMapSchema.parse({
    ...map,
    building_blocks: { ...map.building_blocks, [field]: value.trim() || "none" },
  });
}

export function updateStoryMapPrivacy(
  map: StoryMapV1,
  privacy: { names: boolean; places: boolean; mustNotUse: string[] }
): StoryMapV1 {
  return storyMapSchema.parse({
    ...map,
    permissions: { ...map.permissions, names: privacy.names, places: privacy.places },
    must_not_use: uniqueNonempty(privacy.mustNotUse),
  });
}

function uniqueNonempty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}
