import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { storyMaps } from "./db/schema";
import { storyMapSchema, type StoryMapV1 } from "./story-map";
import { extractionFlagSchema, type StoryMapExtractionFlag } from "./story-map-extraction";
import { z } from "zod";

/**
 * Story Map persistence for the grounded flow.
 *
 * Same degradation contract as every other store: Neon when DATABASE_URL is
 * set, an in-memory map otherwise (pinned to globalThis — Next dev compiles
 * each route into its own bundle, so a bare module-level Map is not shared).
 *
 * The UUID id is the capability. The flow works anonymously, so possession
 * of the unguessable server-generated id gates access — the same trust level
 * as a client-generated songId. Status transitions are enforced here and
 * re-asserted by the grounded pipeline itself.
 */

export interface StoryMapRecord {
  id: string;
  status: "draft" | "approved";
  map: StoryMapV1;
  flags: StoryMapExtractionFlag[];
}

const flagsSchema = z.array(extractionFlagSchema).max(20);

const memory: Map<string, StoryMapRecord> = ((globalThis as Record<string, unknown>).__unwrittenStoryMaps ??=
  new Map<string, StoryMapRecord>()) as Map<string, StoryMapRecord>;

/** Allocates the server-supplied story_map_id in the story_map.v1 id format. */
export function newStoryMapId(): string {
  return `sm_${randomUUID()}`;
}

export async function createStoryMapDraft(
  map: StoryMapV1,
  flags: StoryMapExtractionFlag[]
): Promise<StoryMapRecord> {
  if (map.status !== "draft") throw new Error("Only a draft Story Map can be stored as a draft.");
  const record: StoryMapRecord = { id: map.story_map_id, status: "draft", map, flags };
  const db = getDb();
  if (db) {
    await db.insert(storyMaps).values({ id: record.id, status: "draft", map, flags });
  } else {
    memory.set(record.id, structuredClone(record));
  }
  return record;
}

export async function getStoryMapRecord(id: string): Promise<StoryMapRecord | null> {
  const db = getDb();
  if (db) {
    const row = (await db.select().from(storyMaps).where(eq(storyMaps.id, id)).limit(1))[0];
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      map: storyMapSchema.parse(row.map),
      flags: flagsSchema.parse(row.flags ?? []),
    };
  }
  const record = memory.get(id);
  return record ? structuredClone(record) : null;
}

/** Persists the writer-approved map. The caller performs the approval itself. */
export async function saveApprovedStoryMap(id: string, approved: StoryMapV1): Promise<void> {
  if (approved.status !== "approved") throw new Error("Only an approved Story Map can be saved as approved.");
  if (approved.story_map_id !== id) throw new Error("Story Map id mismatch.");
  const db = getDb();
  if (db) {
    await db
      .update(storyMaps)
      .set({ status: "approved", map: approved, flags: [], updatedAt: new Date() })
      .where(eq(storyMaps.id, id));
  } else {
    const record = memory.get(id);
    if (!record) throw new Error("Story Map not found.");
    memory.set(id, { id, status: "approved", map: structuredClone(approved), flags: [] });
  }
}

/** Test seam. */
export function resetStoryMapsForTesting(): void {
  memory.clear();
}
