import { del } from "@vercel/blob";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { deleteAudio } from "@/lib/audio-store";
import { songs, songUnlocks, takes } from "@/lib/db/schema";

/**
 * Saved songs — Neon Postgres.
 *
 * V2 stored one JSON record per song in Blob at
 * liner-notes-songs/{userId}/{songId}.json and listed by prefix, which meant a
 * read-modify-write per mutation, a CDN cache that had to be bypassed with
 * `useCache: false`, and a hard 50-song listing cap.
 *
 * Audio bytes still live in the PRIVATE Blob store — only pathnames are
 * stored here. Audio is never handed over as a file URL; it is served through
 * /api/audio/[token] behind an HMAC-signed token, so the paywall keeps exactly
 * one gate.
 *
 * With no DATABASE_URL the store falls back to an in-memory map (audio bytes
 * included) so local dev and tests run without a database.
 */

/** One rendered performance of a song. Every take stores a full master. */
export interface SongTake {
  /** 1-based take number. */
  n: number;
  createdAt: string;
  provider: string;
  mimeType: string;
  quality: "full" | "preview";
  sizeBytes?: number;
  /** Postgres audio row for the FULL master — never exposed to clients. */
  masterAudioId?: string;
  /** Postgres audio row for the short preview. */
  previewAudioId?: string;
  /** LEGACY Blob pathname of the master (takes predating the Postgres move). */
  masterPathname?: string;
  /** LEGACY Blob pathname of the preview. */
  previewPathname?: string;
}

export interface SavedSong {
  id: string;
  title: string;
  lyrics: string;
  stylePrompt: string;
  coverArt?: string;
  provider: string;
  mimeType: string;
  createdAt: string;
  /** Whether the full masters may be served (derived from song_unlocks). */
  unlocked: boolean;
  favorite?: boolean;
  /** Master audio size in bytes of the latest take. */
  sizeBytes?: number;
  /** All rendered takes, oldest first. */
  takes: SongTake[];
  /** Postgres audio row for the FULL master of the latest take. */
  masterAudioId?: string;
  /** Postgres audio row for the preview of the latest take. */
  previewAudioId?: string;
  /** LEGACY Blob pathname of the master. */
  masterPathname?: string;
  /** LEGACY Blob pathname of the preview. */
  previewPathname?: string;
}

/**
 * Listing bound. Not a silent truncation of a user's vault — it is a page
 * size; a user at this limit needs pagination, which the songs table now
 * supports (V2's Blob prefix listing did not).
 */
const MAX_LISTED_SONGS = 200;

interface MemorySong extends SavedSong {
  /** take number → bytes (memory backend only). */
  takeAudio: Map<number, { masterBytes: Buffer; previewBytes: Buffer }>;
}

// globalThis-pinned: Next dev compiles each route into its own bundle with its
// own module instance, so a plain module-level Map is not shared.
const memorySongs: Map<string, Map<string, MemorySong>> = ((
  globalThis as Record<string, unknown>
).__linerNotesSongsStore ??= new Map<string, Map<string, MemorySong>>()) as Map<string, Map<string, MemorySong>>;

function dbOrNull() {
  return getDb();
}

function rowsToSong(
  song: typeof songs.$inferSelect,
  takeRows: Array<typeof takes.$inferSelect>,
  unlocked: boolean
): SavedSong {
  const ordered = [...takeRows].sort((a, b) => a.n - b.n);
  const latest = ordered[ordered.length - 1];
  const ownsFullTake = ordered.some((take) => take.quality === "full");
  return {
    id: song.id,
    title: song.title,
    lyrics: song.lyrics,
    stylePrompt: song.stylePrompt,
    coverArt: song.coverArt ?? undefined,
    provider: song.provider,
    mimeType: song.mimeType,
    createdAt: song.createdAt.toISOString(),
    unlocked: unlocked || ownsFullTake,
    favorite: song.favorite,
    sizeBytes: latest?.sizeBytes ?? undefined,
    takes: ordered.map((t) => ({
      n: t.n,
      createdAt: t.createdAt.toISOString(),
      provider: t.provider,
      mimeType: t.mimeType,
      quality: t.quality,
      sizeBytes: t.sizeBytes ?? undefined,
      masterAudioId: t.masterAudioId ?? undefined,
      previewAudioId: t.previewAudioId ?? undefined,
      masterPathname: t.masterPathname ?? undefined,
      previewPathname: t.previewPathname ?? undefined,
    })),
    masterAudioId: latest?.masterAudioId ?? undefined,
    previewAudioId: latest?.previewAudioId ?? undefined,
    masterPathname: latest?.masterPathname ?? undefined,
    previewPathname: latest?.previewPathname ?? undefined,
  };
}

/**
 * Appends a rendered take to a song, creating the song row on the first take.
 * Takes accumulate so the listener can compare performances and unlock the one
 * they like. The take number is allocated inside the transaction and the
 * (song_id, n) unique constraint makes a duplicate take number impossible.
 */
export async function saveSongTake(
  userId: string,
  base: Omit<
    SavedSong,
    | "takes"
    | "masterAudioId"
    | "previewAudioId"
    | "masterPathname"
    | "previewPathname"
    | "sizeBytes"
  >,
  take: Omit<SongTake, "n">,
  audio?: { masterBytes: Buffer; previewBytes: Buffer }
): Promise<SavedSong> {
  const db = dbOrNull();

  if (db) {
    return db.transaction(async (tx) => {
      await tx
        .insert(songs)
        .values({
          id: base.id,
          userId,
          title: base.title,
          lyrics: base.lyrics,
          stylePrompt: base.stylePrompt,
          coverArt: base.coverArt ?? null,
          provider: base.provider,
          mimeType: base.mimeType,
          favorite: base.favorite ?? false,
          createdAt: new Date(base.createdAt),
        })
        .onConflictDoNothing();

      // Serialize take allocation for this song and reject a caller trying to
      // append audio to another user's song id.
      await tx.execute(sql`select id from ${songs} where id = ${base.id} for update`);
      const [ownedSong] = await tx.select().from(songs).where(eq(songs.id, base.id));
      if (!ownedSong || ownedSong.userId !== userId) {
        throw new Error(`song ${base.id} is not owned by ${userId}`);
      }

      const existing = await tx.select().from(takes).where(eq(takes.songId, base.id));
      const n = existing.reduce((highest, row) => Math.max(highest, row.n), 0) + 1;
      await tx.insert(takes).values({
        songId: base.id,
        n,
        provider: take.provider,
        mimeType: take.mimeType,
        quality: take.quality,
        sizeBytes: take.sizeBytes ?? null,
        masterAudioId: take.masterAudioId ?? null,
        previewAudioId: take.previewAudioId ?? null,
        masterPathname: take.masterPathname ?? null,
        previewPathname: take.previewPathname ?? null,
        createdAt: new Date(take.createdAt),
      });
      await tx.update(songs).set({ updatedAt: new Date() }).where(eq(songs.id, base.id));

      const [song] = await tx.select().from(songs).where(eq(songs.id, base.id));
      if (!song) throw new Error(`song row missing for ${base.id} after upsert`);
      const allTakes = await tx.select().from(takes).where(eq(takes.songId, base.id));
      const unlock = await tx
        .select()
        .from(songUnlocks)
        .where(and(eq(songUnlocks.userId, userId), eq(songUnlocks.songId, base.id)));
      return rowsToSong(song, allTakes, unlock.length > 0);
    });
  }

  const existing = memorySongs.get(userId)?.get(base.id);
  const previousTakes = existing?.takes ?? [];
  const nextTake: SongTake = { ...take, n: previousTakes.length + 1 };
  const record: SavedSong = {
    ...base,
    // Preserve flags earned earlier (an unlock, a favourite).
    unlocked: base.unlocked || existing?.unlocked === true,
    favorite: existing?.favorite ?? base.favorite,
    createdAt: existing?.createdAt ?? base.createdAt,
    takes: [...previousTakes, nextTake],
    sizeBytes: nextTake.sizeBytes,
    masterAudioId: nextTake.masterAudioId,
    previewAudioId: nextTake.previewAudioId,
    masterPathname: nextTake.masterPathname,
    previewPathname: nextTake.previewPathname,
  };
  let userSongs = memorySongs.get(userId);
  if (!userSongs) {
    userSongs = new Map();
    memorySongs.set(userId, userSongs);
  }
  const takeAudio = existing?.takeAudio ?? new Map();
  if (audio) takeAudio.set(nextTake.n, audio);
  userSongs.set(record.id, { ...record, takeAudio });
  return record;
}

/** Rolls back one newly-created take when entitlement finalization fails. */
export async function rollbackSongTake(
  userId: string,
  songId: string,
  takeNumber: number
): Promise<void> {
  const db = dbOrNull();
  if (db) {
    await db.transaction(async (tx) => {
      const [song] = await tx
        .select({ id: songs.id })
        .from(songs)
        .where(and(eq(songs.id, songId), eq(songs.userId, userId)));
      if (!song) return;
      await tx.delete(takes).where(and(eq(takes.songId, songId), eq(takes.n, takeNumber)));
      const remaining = await tx.select({ n: takes.n }).from(takes).where(eq(takes.songId, songId));
      if (remaining.length === 0) {
        await tx.delete(songs).where(and(eq(songs.id, songId), eq(songs.userId, userId)));
      }
    });
    return;
  }

  const userSongs = memorySongs.get(userId);
  const song = userSongs?.get(songId);
  if (!song) return;
  const remaining = song.takes.filter((take) => take.n !== takeNumber);
  song.takeAudio.delete(takeNumber);
  if (remaining.length === 0) {
    userSongs?.delete(songId);
    return;
  }
  const latest = remaining[remaining.length - 1];
  userSongs?.set(songId, {
    ...song,
    takes: remaining,
    sizeBytes: latest?.sizeBytes,
    masterAudioId: latest?.masterAudioId,
    previewAudioId: latest?.previewAudioId,
    masterPathname: latest?.masterPathname,
    previewPathname: latest?.previewPathname,
  });
}

export async function listSongs(userId: string): Promise<SavedSong[]> {
  const db = dbOrNull();

  if (db) {
    const songRows = await db
      .select()
      .from(songs)
      .where(eq(songs.userId, userId))
      .orderBy(desc(songs.createdAt))
      .limit(MAX_LISTED_SONGS);
    if (songRows.length === 0) return [];

    const ids = songRows.map((s) => s.id);
    const takeRows = await db.select().from(takes).where(inArray(takes.songId, ids));
    const unlockRows = await db.select().from(songUnlocks).where(eq(songUnlocks.userId, userId));
    const unlocked = new Set(unlockRows.map((u) => u.songId));

    const byId = new Map<string, Array<typeof takes.$inferSelect>>();
    for (const t of takeRows) {
      const list = byId.get(t.songId) ?? [];
      list.push(t);
      byId.set(t.songId, list);
    }
    return songRows.map((s) => rowsToSong(s, byId.get(s.id) ?? [], unlocked.has(s.id)));
  }

  const userSongs = memorySongs.get(userId);
  if (!userSongs) return [];
  return [...userSongs.values()]
    .map(({ takeAudio: _audio, ...song }) => song)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function readSong(userId: string, songId: string): Promise<SavedSong | null> {
  const db = dbOrNull();

  if (db) {
    const [song] = await db
      .select()
      .from(songs)
      .where(and(eq(songs.id, songId), eq(songs.userId, userId)));
    if (!song) return null;
    const takeRows = await db.select().from(takes).where(eq(takes.songId, songId));
    const unlock = await db
      .select()
      .from(songUnlocks)
      .where(and(eq(songUnlocks.userId, userId), eq(songUnlocks.songId, songId)));
    return rowsToSong(song, takeRows, unlock.length > 0);
  }

  const song = memorySongs.get(userId)?.get(songId);
  if (!song) return null;
  const { takeAudio: _audio, ...record } = song;
  return record;
}

/** Applies a partial update (e.g. favorite) to an owned song record. */
export async function updateSong(
  userId: string,
  songId: string,
  patch: Partial<Pick<SavedSong, "favorite" | "title" | "coverArt">>
): Promise<SavedSong | null> {
  const db = dbOrNull();

  if (db) {
    const updated = await db
      .update(songs)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(songs.id, songId), eq(songs.userId, userId)))
      .returning({ id: songs.id });
    if (updated.length === 0) return null;
    return readSong(userId, songId);
  }

  const existing = memorySongs.get(userId)?.get(songId);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  memorySongs.get(userId)?.set(songId, next);
  const { takeAudio: _audio, ...record } = next;
  return record;
}

/** Deletes an owned song and its audio blobs. Takes cascade with the song. */
export async function deleteSong(userId: string, songId: string): Promise<boolean> {
  const current = await readSong(userId, songId);
  if (!current) return false;
  const db = dbOrNull();

  if (db) {
    const audioIds: string[] = [];
    const blobTargets: string[] = [];
    for (const take of current.takes) {
      if (take.masterAudioId) audioIds.push(take.masterAudioId);
      if (take.previewAudioId) audioIds.push(take.previewAudioId);
      if (take.masterPathname) blobTargets.push(take.masterPathname);
      if (take.previewPathname) blobTargets.push(take.previewPathname);
    }
    // Delete the song first: removing the row is what makes the song
    // disappear for the user, so it must not be blocked by storage cleanup.
    // Audio rows are ON DELETE SET NULL, so they outlive the take and are
    // removed explicitly here.
    await db.delete(songs).where(and(eq(songs.id, songId), eq(songs.userId, userId)));
    await deleteAudio(audioIds).catch(() => {});
    if (blobTargets.length > 0) await del(blobTargets).catch(() => {});
    return true;
  }

  return memorySongs.get(userId)?.delete(songId) ?? false;
}

/** Memory backend only: raw audio bytes for re-tokenized playback. */
export function getMemoryTakeAudio(
  userId: string,
  songId: string,
  takeNumber: number,
  which: "master" | "preview"
): { bytes: Buffer; mimeType: string } | null {
  const song = memorySongs.get(userId)?.get(songId);
  const audio = song?.takeAudio.get(takeNumber);
  if (!song || !audio) return null;
  const bytes = which === "master" ? audio.masterBytes : audio.previewBytes;
  if (bytes.length === 0) return null;
  return { bytes, mimeType: song.mimeType };
}

/** Memory backend: bytes of the newest take. */
export function getMemorySongAudio(
  userId: string,
  songId: string,
  which: "master" | "preview"
): { bytes: Buffer; mimeType: string } | null {
  const song = memorySongs.get(userId)?.get(songId);
  if (!song) return null;
  return getMemoryTakeAudio(userId, songId, song.takes.length, which);
}

/**
 * Ensures the unlock row exists for a paid song.
 *
 * Unlocks are rows in song_unlocks, written by the verified Stripe webhook
 * through the entitlement service. This is the webhook's belt-and-braces call
 * and is idempotent; `unlocked` on a SavedSong is derived, never stored.
 */
export async function markSongUnlocked(userId: string, songId: string): Promise<void> {
  const db = dbOrNull();
  if (db) {
    await db.insert(songUnlocks).values({ userId, songId }).onConflictDoNothing();
    return;
  }
  const existing = memorySongs.get(userId)?.get(songId);
  if (existing) memorySongs.get(userId)?.set(songId, { ...existing, unlocked: true });
}

/** Test seam. */
export function clearSongsStoreForTesting(): void {
  memorySongs.clear();
}
