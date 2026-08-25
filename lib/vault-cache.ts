import type { SavedSongWire } from "@/lib/songs-wire";

const KEY = "unwritten:vault-preview:v1";
const TTL_MS = 5 * 60 * 1000;

export interface CachedPlaylistWire {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  trackCount: number;
  coverSongIds: string[];
}

interface VaultCache {
  userId: string;
  expiresAt: number;
  songs: SavedSongWire[];
  playlists: CachedPlaylistWire[];
}

export function readVaultCache(userId: string): Omit<VaultCache, "userId" | "expiresAt"> | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as VaultCache | null;
    if (!parsed || parsed.userId !== userId || parsed.expiresAt <= Date.now()) return null;
    if (!Array.isArray(parsed.songs) || !Array.isArray(parsed.playlists)) return null;
    return { songs: parsed.songs, playlists: parsed.playlists };
  } catch {
    return null;
  }
}

export function writeVaultCache(userId: string, songs: SavedSongWire[], playlists: CachedPlaylistWire[]): void {
  try {
    // Generated covers are large data URLs. Keep the newest cover—the one the
    // featured card needs—and omit older covers so this cache stays below the
    // browser's small sessionStorage quota.
    const compactSongs = songs.map((song, index) => index === 0 ? song : { ...song, coverArt: null });
    sessionStorage.setItem(KEY, JSON.stringify({ userId, expiresAt: Date.now() + TTL_MS, songs: compactSongs, playlists } satisfies VaultCache));
  } catch {
    // Private browsing or storage pressure can disable this optimization.
  }
}
