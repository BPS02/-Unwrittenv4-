import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_PLAYLIST_NAME,
  PlaylistError,
  addSongToPlaylist,
  clearPlaylistsForTesting,
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  normalizePlaylistName,
  readPlaylist,
  removeSongFromPlaylist,
  renamePlaylist,
} from "@/lib/playlists-store";
import { artFor } from "@/lib/cover-art";

/**
 * Playlists run against the in-memory backend here, like the rest of the
 * suite. The property that matters most is ownership: a playlist id is
 * guessable in a way a song id is not (it is handed to the client in every
 * listing), so every operation must be scoped to the caller.
 */

const ALICE = "user_alice";
const BOB = "user_bob";

beforeEach(() => {
  clearPlaylistsForTesting();
});

describe("playlist names", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizePlaylistName("  Road   trip  ")).toBe("Road trip");
  });

  it("rejects an empty name", () => {
    expect(() => normalizePlaylistName("   ")).toThrow(PlaylistError);
    expect(() => normalizePlaylistName(undefined)).toThrow(PlaylistError);
  });

  it("rejects a name past the limit", () => {
    expect(() => normalizePlaylistName("x".repeat(MAX_PLAYLIST_NAME + 1))).toThrow(PlaylistError);
    expect(normalizePlaylistName("x".repeat(MAX_PLAYLIST_NAME))).toHaveLength(MAX_PLAYLIST_NAME);
  });
});

describe("creating and listing", () => {
  it("creates an empty playlist and lists it back", async () => {
    const created = await createPlaylist(ALICE, "Road trip");
    expect(created.name).toBe("Road trip");
    expect(created.trackCount).toBe(0);
    expect(created.coverSongIds).toEqual([]);

    const list = await listPlaylists(ALICE);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(created.id);
  });

  it("never lists another user's playlists", async () => {
    await createPlaylist(ALICE, "Alice only");
    expect(await listPlaylists(BOB)).toEqual([]);
  });
});

describe("ownership", () => {
  it("hides another user's playlist behind a 404, not a 403", async () => {
    // A 403 would confirm the id exists. 404 reveals nothing either way.
    const alicePlaylist = await createPlaylist(ALICE, "Alice only");
    await expect(readPlaylist(BOB, alicePlaylist.id)).rejects.toMatchObject({ status: 404 });
    await expect(renamePlaylist(BOB, alicePlaylist.id, "Hijacked")).rejects.toMatchObject({
      status: 404,
    });
    await expect(deletePlaylist(BOB, alicePlaylist.id)).rejects.toMatchObject({ status: 404 });
    await expect(addSongToPlaylist(BOB, alicePlaylist.id, "song-1")).rejects.toMatchObject({
      status: 404,
    });
    await expect(removeSongFromPlaylist(BOB, alicePlaylist.id, "song-1")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("leaves the owner's playlist untouched after a failed attempt", async () => {
    const playlist = await createPlaylist(ALICE, "Alice only");
    await addSongToPlaylist(ALICE, playlist.id, "song-1");
    await expect(renamePlaylist(BOB, playlist.id, "Hijacked")).rejects.toThrow();

    const after = await readPlaylist(ALICE, playlist.id);
    expect(after.name).toBe("Alice only");
    expect(after.songIds).toEqual(["song-1"]);
  });
});

describe("tracks", () => {
  it("adds songs in order and counts them", async () => {
    const playlist = await createPlaylist(ALICE, "Road trip");
    await addSongToPlaylist(ALICE, playlist.id, "song-1");
    const updated = await addSongToPlaylist(ALICE, playlist.id, "song-2");
    expect(updated.songIds).toEqual(["song-1", "song-2"]);
    expect(updated.trackCount).toBe(2);
  });

  it("adding the same song twice is a no-op, not a duplicate", async () => {
    const playlist = await createPlaylist(ALICE, "Road trip");
    await addSongToPlaylist(ALICE, playlist.id, "song-1");
    const again = await addSongToPlaylist(ALICE, playlist.id, "song-1");
    expect(again.songIds).toEqual(["song-1"]);
  });

  it("removes a song without touching the others", async () => {
    const playlist = await createPlaylist(ALICE, "Road trip");
    await addSongToPlaylist(ALICE, playlist.id, "song-1");
    await addSongToPlaylist(ALICE, playlist.id, "song-2");
    const removed = await removeSongFromPlaylist(ALICE, playlist.id, "song-1");
    expect(removed.songIds).toEqual(["song-2"]);
  });

  it("exposes at most four cover songs for the collage tile", async () => {
    const playlist = await createPlaylist(ALICE, "Big one");
    for (let i = 0; i < 7; i++) await addSongToPlaylist(ALICE, playlist.id, `song-${i}`);
    const list = await listPlaylists(ALICE);
    expect(list[0]?.trackCount).toBe(7);
    expect(list[0]?.coverSongIds).toHaveLength(4);
  });

  it("deleting a playlist reports gone on the next read", async () => {
    const playlist = await createPlaylist(ALICE, "Temporary");
    await deletePlaylist(ALICE, playlist.id);
    await expect(readPlaylist(ALICE, playlist.id)).rejects.toMatchObject({ status: 404 });
    expect(await listPlaylists(ALICE)).toEqual([]);
  });
});

describe("cover art", () => {
  it("is deterministic per song id", () => {
    expect(artFor("song-1")).toBe(artFor("song-1"));
  });

  it("differs across ids often enough to distinguish tiles", () => {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => artFor(`song-${i}`)));
    expect(seen.size).toBeGreaterThan(1);
  });
});
