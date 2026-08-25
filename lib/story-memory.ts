import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { storyMemories, storyProfiles } from "@/lib/db/schema";
import type { SongInput } from "@/lib/types";

export const MAX_MEMORY_DETAIL = 2_000;
export const MAX_PROFILE_MEMORIES = 200;
const MAX_PROMPT_MEMORIES = 40;
const MAX_PROMPT_CHARS = 12_000;

export interface StoryMemoryWire {
  id: string;
  detail: string;
  source: "song" | "profile";
  createdAt: string;
  updatedAt: string;
}

interface MemoryState {
  enabled: Map<string, boolean>;
  rows: Map<string, StoryMemoryWire & { userId: string; fingerprint: string }>;
}

const memory: MemoryState = ((globalThis as Record<string, unknown>).__unwrittenStoryMemory ??= {
  enabled: new Map(),
  rows: new Map(),
} satisfies MemoryState) as MemoryState;

function clean(detail: string): string {
  return detail.replace(/\s+/g, " ").trim().slice(0, MAX_MEMORY_DETAIL);
}

function fingerprint(detail: string): string {
  return createHash("sha256").update(detail.toLocaleLowerCase()).digest("hex");
}

export function detailsFromSongInput(input: SongInput): string[] {
  const details = [
    input.thought,
    input.feelings.length > 0 ? `Feelings: ${input.feelings.join(", ")}` : "",
    input.feelingsText,
    input.context,
    ...(input.answers ?? []).map((answer) => `${answer.question}: ${answer.answer}`),
  ];
  return [...new Set(details.map(clean).filter((detail) => detail.length >= 2))];
}

export async function memoryEnabledFor(userId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return memory.enabled.get(userId) ?? true;
  const [row] = await db.select().from(storyProfiles).where(eq(storyProfiles.userId, userId));
  return row?.memoryEnabled ?? true;
}

export async function setMemoryEnabled(userId: string, enabled: boolean): Promise<void> {
  const db = getDb();
  if (!db) {
    memory.enabled.set(userId, enabled);
    return;
  }
  await db.insert(storyProfiles).values({ userId, memoryEnabled: enabled }).onConflictDoUpdate({
    target: storyProfiles.userId,
    set: { memoryEnabled: enabled, updatedAt: new Date() },
  });
}

export async function addStoryMemory(
  userId: string,
  detail: string,
  source: "song" | "profile" = "profile"
): Promise<void> {
  const normalized = clean(detail);
  if (!normalized) return;
  const key = fingerprint(normalized);
  const db = getDb();
  if (!db) {
    const existing = [...memory.rows.values()].find((row) => row.userId === userId && row.fingerprint === key);
    if (existing) return;
    const now = new Date().toISOString();
    const id = randomUUID();
    memory.rows.set(id, { id, userId, detail: normalized, fingerprint: key, source, createdAt: now, updatedAt: now });
    return;
  }
  await db.insert(storyMemories).values({ userId, detail: normalized, fingerprint: key, source }).onConflictDoNothing();
}

export async function saveSongInputMemories(userId: string, input: SongInput): Promise<void> {
  if (!(await memoryEnabledFor(userId))) return;
  await Promise.all(detailsFromSongInput(input).map((detail) => addStoryMemory(userId, detail, "song")));
}

export async function listStoryMemories(userId: string): Promise<StoryMemoryWire[]> {
  const db = getDb();
  if (!db) {
    return [...memory.rows.values()]
      .filter((row) => row.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_PROFILE_MEMORIES)
      .map(({ userId: _userId, fingerprint: _fingerprint, ...row }) => row);
  }
  const rows = await db.select().from(storyMemories).where(eq(storyMemories.userId, userId)).orderBy(desc(storyMemories.updatedAt)).limit(MAX_PROFILE_MEMORIES);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }));
}

export async function promptStoryMemories(userId: string): Promise<string[]> {
  if (!(await memoryEnabledFor(userId))) return [];
  const rows = (await listStoryMemories(userId)).slice(0, MAX_PROMPT_MEMORIES);
  const selected: string[] = [];
  let chars = 0;
  for (const row of rows) {
    if (chars + row.detail.length > MAX_PROMPT_CHARS) break;
    selected.push(row.detail);
    chars += row.detail.length;
  }
  return selected;
}

export async function updateStoryMemory(userId: string, id: string, detail: string): Promise<boolean> {
  const normalized = clean(detail);
  if (!normalized) return false;
  const key = fingerprint(normalized);
  const db = getDb();
  if (!db) {
    const row = memory.rows.get(id);
    if (!row || row.userId !== userId) return false;
    memory.rows.set(id, { ...row, detail: normalized, fingerprint: key, updatedAt: new Date().toISOString() });
    return true;
  }
  const rows = await db.update(storyMemories).set({ detail: normalized, fingerprint: key, updatedAt: new Date() }).where(and(eq(storyMemories.id, id), eq(storyMemories.userId, userId))).returning({ id: storyMemories.id });
  return rows.length > 0;
}

export async function deleteStoryMemory(userId: string, id: string): Promise<boolean> {
  const db = getDb();
  if (!db) {
    const row = memory.rows.get(id);
    if (!row || row.userId !== userId) return false;
    return memory.rows.delete(id);
  }
  const rows = await db.delete(storyMemories).where(and(eq(storyMemories.id, id), eq(storyMemories.userId, userId))).returning({ id: storyMemories.id });
  return rows.length > 0;
}

export async function clearStoryMemories(userId: string): Promise<void> {
  const db = getDb();
  if (!db) {
    for (const [id, row] of memory.rows) if (row.userId === userId) memory.rows.delete(id);
    return;
  }
  await db.delete(storyMemories).where(eq(storyMemories.userId, userId));
}

export function resetStoryMemoryForTesting(): void {
  memory.enabled.clear();
  memory.rows.clear();
}
