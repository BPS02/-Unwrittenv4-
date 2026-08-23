import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { playlistItems, playlists, songs } from "@/lib/db/schema";

/**
 * Playlists — Neon Postgres, with the same in-memory fallback as the songs
 * store so local dev and the test suite run without a database.
 *
 * Ownership is enforced on EVERY read and write by scoping to the Clerk
 * userId the caller resolved from `auth()`. A playlist id alone is never
 * enough to touch a playlist: `requireOwned` is the single gate, and adding a
 * song additionally verifies the SONG is owned too, so a playlist can never
 * be used to pull another account's audio into view.
 */

export interface PlaylistSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  trackCount: number;
  /** Song ids of the first few tracks, for the 2×2 collage tile. */
  coverSongIds: string[];
}

export interface PlaylistDetail extends PlaylistSummary {
  songIds: string[];
}

/** Playlist names are shown verbatim; keep them short and single-line. */
export const MAX_PLAYLIST_NAME = 80;
/** Tiles show a 2×2 collage. */
const COVER_SLOTS = 4;
const MAX_PLAYLISTS = 200;

export class PlaylistError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "PlaylistError";
  }
}

/** Trims and validates a user-supplied playlist name. */
export function normalizePlaylistName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (name.length === 0) throw new PlaylistError("Give the playlist a name.", 400);
  if (name.length > MAX_PLAYLIST_NAME) {
    throw new PlaylistError(`Keep the name under ${MAX_PLAYLIST_NAME} characters.`, 400);
  }
  return name;
}

/* ------------------------------------------------------------------ */
/* In-memory backend                                                    */
/* ------------------------------------------------------------------ */

interface MemoryPlaylist {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  songIds: string[];
}

// globalThis-pinned for the same reason as the other dev stores: Next dev
// compiles each route into its own bundle with its own module instance.
const memory: Map<string, MemoryPlaylist> = ((globalThis as Record<string, unknown>)
  .__linerNotesPlaylists ??= new Map<string, MemoryPlaylist>()) as Map<string, MemoryPlaylist>;

let memorySeq = 0;

function memoryOwned(userId: string): MemoryPlaylist[] {
  return [...memory.values()]
    .filter((p) => p.userId === userId)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function toSummary(p: MemoryPlaylist): PlaylistDetail {
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    trackCount: p.songIds.length,
    coverSongIds: p.songIds.slice(0, COVER_SLOTS),
    songIds: [...p.songIds],
  };
}

/** Test seam. */
export function clearPlaylistsForTesting(): void {
  memory.clear();
  memorySeq = 0;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function listPlaylists(userId: string): Promise<PlaylistSummary[]> {
  const db = getDb();

  if (!db) {
    return memoryOwned(userId).map(toSummary);
  }

  const rows = await db
    .select()
    .from(playlists)
    .where(eq(playlists.userId, userId))
    .orderBy(desc(playlists.updatedAt))
    .limit(MAX_PLAYLISTS);
  if (rows.length === 0) return [];

  const items = await db
    .select()
    .from(playlistItems)
    .where(inArray(playlistItems.playlistId, rows.map((r) => r.id)))
    .orderBy(asc(playlistItems.position), asc(playlistItems.addedAt));

  const byPlaylist = new Map<string, string[]>();
  for (const item of items) {
    const list = byPlaylist.get(item.playlistId) ?? [];
    list.push(item.songId);
    byPlaylist.set(item.playlistId, list);
  }

  return rows.map((row) => {
    const songIds = byPlaylist.get(row.id) ?? [];
    return {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      trackCount: songIds.length,
      coverSongIds: songIds.slice(0, COVER_SLOTS),
    };
  });
}

export async function createPlaylist(userId: string, rawName: string): Promise<PlaylistDetail> {
  const name = normalizePlaylistName(rawName);
  const db = getDb();
  const now = new Date();

  if (!db) {
    const id = `pl-mem-${++memorySeq}`;
    const record: MemoryPlaylist = {
      id,
      userId,
      name,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      songIds: [],
    };
    memory.set(id, record);
    return toSummary(record);
  }

  const [row] = await db.insert(playlists).values({ userId, name }).returning();
  if (!row) throw new PlaylistError("Could not create the playlist.", 500);
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    trackCount: 0,
    coverSongIds: [],
    songIds: [],
  };
}

/**
 * Loads a playlist the user owns, or throws 404. Never leaks the difference
 * between "does not exist" and "belongs to someone else".
 */
export async function readPlaylist(userId: string, playlistId: string): Promise<PlaylistDetail> {
  const db = getDb();

  if (!db) {
    const record = memory.get(playlistId);
    if (!record || record.userId !== userId) {
      throw new PlaylistError("Playlist not found.", 404);
    }
    return toSummary(record);
  }

  const [row] = await db
    .select()
    .from(playlists)
    .where(and(eq(playlists.id, playlistId), eq(playlists.userId, userId)));
  if (!row) throw new PlaylistError("Playlist not found.", 404);

  const items = await db
    .select()
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlistId))
    .orderBy(asc(playlistItems.position), asc(playlistItems.addedAt));
  const songIds = items.map((i) => i.songId);

  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    trackCount: songIds.length,
    coverSongIds: songIds.slice(0, COVER_SLOTS),
    songIds,
  };
}

export async function renamePlaylist(
  userId: string,
  playlistId: string,
  rawName: string
): Promise<PlaylistDetail> {
  const name = normalizePlaylistName(rawName);
  const db = getDb();

  if (!db) {
    const record = memory.get(playlistId);
    if (!record || record.userId !== userId) throw new PlaylistError("Playlist not found.", 404);
    record.name = name;
    record.updatedAt = new Date().toISOString();
    return toSummary(record);
  }

  const updated = await db
    .update(playlists)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(playlists.id, playlistId), eq(playlists.userId, userId)))
    .returning({ id: playlists.id });
  if (updated.length === 0) throw new PlaylistError("Playlist not found.", 404);
  return readPlaylist(userId, playlistId);
}

export async function deletePlaylist(userId: string, playlistId: string): Promise<void> {
  const db = getDb();

  if (!db) {
    const record = memory.get(playlistId);
    if (!record || record.userId !== userId) throw new PlaylistError("Playlist not found.", 404);
    memory.delete(playlistId);
    return;
  }

  // Items cascade with the playlist row.
  const deleted = await db
    .delete(playlists)
    .where(and(eq(playlists.id, playlistId), eq(playlists.userId, userId)))
    .returning({ id: playlists.id });
  if (deleted.length === 0) throw new PlaylistError("Playlist not found.", 404);
}

/**
 * Adds a song to a playlist. Verifies the user owns BOTH — otherwise a
 * playlist would be a way to pull someone else's song into your own vault
 * view, where /api/songs would happily mint a token for it.
 */
export async function addSongToPlaylist(
  userId: string,
  playlistId: string,
  songId: string
): Promise<PlaylistDetail> {
  const db = getDb();

  if (!db) {
    const record = memory.get(playlistId);
    if (!record || record.userId !== userId) throw new PlaylistError("Playlist not found.", 404);
    if (!record.songIds.includes(songId)) record.songIds.push(songId);
    record.updatedAt = new Date().toISOString();
    return toSummary(record);
  }

  const [owned] = await db
    .select({ id: playlists.id })
    .from(playlists)
    .where(and(eq(playlists.id, playlistId), eq(playlists.userId, userId)));
  if (!owned) throw new PlaylistError("Playlist not found.", 404);

  const [song] = await db
    .select({ id: songs.id })
    .from(songs)
    .where(and(eq(songs.id, songId), eq(songs.userId, userId)));
  if (!song) throw new PlaylistError("Song not found.", 404);

  const positions = await db
    .select({ next: sql<number>`coalesce(max(${playlistItems.position}), -1) + 1` })
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlistId));
  const next = positions[0]?.next ?? 0;

  await db
    .insert(playlistItems)
    .values({ playlistId, songId, position: next })
    // Already in the playlist → keep the original position, don't duplicate.
    .onConflictDoNothing();
  await db.update(playlists).set({ updatedAt: new Date() }).where(eq(playlists.id, playlistId));

  return readPlaylist(userId, playlistId);
}

export async function removeSongFromPlaylist(
  userId: string,
  playlistId: string,
  songId: string
): Promise<PlaylistDetail> {
  const db = getDb();

  if (!db) {
    const record = memory.get(playlistId);
    if (!record || record.userId !== userId) throw new PlaylistError("Playlist not found.", 404);
    record.songIds = record.songIds.filter((id) => id !== songId);
    record.updatedAt = new Date().toISOString();
    return toSummary(record);
  }

  const [owned] = await db
    .select({ id: playlists.id })
    .from(playlists)
    .where(and(eq(playlists.id, playlistId), eq(playlists.userId, userId)));
  if (!owned) throw new PlaylistError("Playlist not found.", 404);

  await db
    .delete(playlistItems)
    .where(and(eq(playlistItems.playlistId, playlistId), eq(playlistItems.songId, songId)));
  await db.update(playlists).set({ updatedAt: new Date() }).where(eq(playlists.id, playlistId));

  return readPlaylist(userId, playlistId);
}
