"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { artFor } from "@/lib/cover-art";
import { lyricsForReading } from "@/lib/lyrics-display";
import AudioPlayer from "./AudioPlayer";
import TrackList from "./TrackList";

export interface SavedSongWire {
  id: string;
  title: string;
  lyrics: string;
  stylePrompt: string;
  coverArt?: string | null;
  provider: string;
  createdAt: string;
  unlocked: boolean;
  downloadable: boolean;
  favorite: boolean;
  sizeBytes: number | null;
  mimeType: string;
  streamPath: string | null;
}

interface PlaylistWire {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  trackCount: number;
  coverSongIds: string[];
}

type Sort = "recent" | "created" | "alpha";

const SORT_LABELS: Record<Sort, string> = {
  recent: "Recently saved",
  created: "Recently created",
  alpha: "A–Z",
};

function clock(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function songDescriptor(song: SavedSongWire): string {
  const first = song.stylePrompt.split(/[,.;|]/)[0]?.trim();
  return first || song.provider || "Original song";
}

/**
 * The two built-in views. They are derived, never stored: "Liked" is just
 * `favorite === true` and "All songs" is the vault itself, so they cannot
 * drift out of sync and cannot be renamed or deleted.
 */
type AutoKey = "liked" | "all";

type View = { kind: "grid" } | { kind: "song"; id: string } | { kind: "auto"; key: AutoKey } | { kind: "playlist"; id: string };

function errorMessageFrom(data: unknown, fallback: string): string {
  return data && typeof data === "object" && "error" in data && typeof data.error === "string"
    ? data.error
    : fallback;
}

/** A 2×2 collage of member artwork, like a playlist thumbnail anywhere else. */
function CollageArt({ songIds, glyph }: { songIds: string[]; glyph?: string }) {
  if (songIds.length === 0) {
    return (
      <div className="pl-art pl-art-empty" aria-hidden="true">
        <span>{glyph ?? "♪"}</span>
      </div>
    );
  }
  // One song fills the tile; two or more tile into quadrants.
  const cells = songIds.length === 1 ? songIds : songIds.slice(0, 4);
  return (
    <div className={`pl-art${cells.length > 1 ? " is-collage" : ""}`} aria-hidden="true">
      {cells.map((id, i) => (
        <span key={`${id}-${i}`} style={{ background: artFor(id) }} />
      ))}
    </div>
  );
}

export default function PlaylistsView() {
  // Render the library shell immediately; saved data hydrates into it without
  // replacing the whole page with an "Opening your vault" interstitial.
  const [songs, setSongs] = useState<SavedSongWire[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistWire[]>([]);
  const [detailSongIds, setDetailSongIds] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "grid" });
  const [sort, setSort] = useState<Sort>("recent");
  const [sortOpen, setSortOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coverBackfillAttempted = useRef(new Set<string>());
  const playerRef = useRef<HTMLAudioElement>(null);
  const [activeSongId, setActiveSongId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playTime, setPlayTime] = useState(0);
  const [playDuration, setPlayDuration] = useState(0);
  const [collectionSort, setCollectionSort] = useState<"newest" | "oldest" | "alpha">("newest");
  const [moodFilter, setMoodFilter] = useState("all");
  const [styleFilter, setStyleFilter] = useState("all");

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const playSong = useCallback((song: SavedSongWire) => {
    if (!song.streamPath) {
      showToast("This song’s audio is no longer available.");
      return;
    }
    if (activeSongId === song.id && playerRef.current) {
      if (playerRef.current.paused) void playerRef.current.play();
      else playerRef.current.pause();
      return;
    }
    setActiveSongId(song.id);
    setPlayTime(0);
    setPlayDuration(0);
    setIsPlaying(true);
  }, [activeSongId, showToast]);

  useEffect(() => {
    if (!activeSongId || !playerRef.current) return;
    playerRef.current.load();
    void playerRef.current.play().catch(() => setIsPlaying(false));
  }, [activeSongId]);

  const loadAll = useCallback(async () => {
    try {
      const [songsRes, playlistsRes] = await Promise.all([
        fetch("/api/songs"),
        fetch("/api/playlists"),
      ]);
      const songsData: unknown = await songsRes.json().catch(() => null);
      if (!songsRes.ok) {
        setError(errorMessageFrom(songsData, "Couldn't load your songs."));
        return;
      }
      setSongs((songsData as { songs: SavedSongWire[] }).songs);
      if (playlistsRes.ok) {
        const p: unknown = await playlistsRes.json().catch(() => null);
        setPlaylists((p as { playlists: PlaylistWire[] })?.playlists ?? []);
      }
    } catch {
      setError("Couldn't load your songs.");
    }
  }, []);

  useEffect(() => {
    void loadAll();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadAll]);

  useEffect(() => {
    const latest = songs[0];
    if (!latest || latest.coverArt || coverBackfillAttempted.current.has(latest.id)) return;
    coverBackfillAttempted.current.add(latest.id);
    const controller = new AbortController();
    let device = "browser";
    try {
      const key = "liner-notes:device:v1";
      device = sessionStorage.getItem(key) ?? crypto.randomUUID();
      sessionStorage.setItem(key, device);
    } catch { /* the server can still rate-limit by address */ }

    void fetch("/api/cover", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-LinerNotes-Device": device },
      body: JSON.stringify({
        title: latest.title,
        lyrics: latest.lyrics,
        genre: "Acoustic / Folk",
        mood: "Bittersweet",
        style: latest.stylePrompt,
      }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("cover unavailable");
      return response.json() as Promise<{ imageUrl: string }>;
    }).then(async ({ imageUrl }) => {
      const saved = await fetch(`/api/songs/${encodeURIComponent(latest.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverArt: imageUrl }),
        signal: controller.signal,
      });
      if (!saved.ok) throw new Error("cover could not be saved");
      setSongs((current) => current.map((song) => song.id === latest.id ? { ...song, coverArt: imageUrl } : song));
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Keep the calm fallback art. A later visit may retry the one-time fill.
    });
    return () => controller.abort();
  }, [songs]);

  const songById = useMemo(() => {
    const map = new Map<string, SavedSongWire>();
    for (const s of songs) map.set(s.id, s);
    return map;
  }, [songs]);

  const liked = useMemo(() => songs.filter((s) => s.favorite), [songs]);

  const sortedPlaylists = useMemo(() => {
    const list = [...playlists];
    if (sort === "alpha") return list.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "created") {
      return list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }
    return list.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [playlists, sort]);

  const visiblePlaylists = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return sortedPlaylists;
    return sortedPlaylists.filter((playlist) => playlist.name.toLocaleLowerCase().includes(term));
  }, [search, sortedPlaylists]);

  /* ── Playlist mutations ───────────────────────────────────────────── */

  const createPlaylist = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(errorMessageFrom(data, "Couldn't create the playlist."));
        return;
      }
      const created = (data as { playlist: PlaylistWire }).playlist;
      setPlaylists((prev) => [created, ...prev]);
      setCreating(false);
      setNewName("");
      showToast(`“${created.name}” created`);
    } catch {
      showToast("Couldn't create the playlist.");
    }
  };

  const patchPlaylist = async (id: string, patch: Record<string, string>, successMessage?: string) => {
    try {
      const res = await fetch(`/api/playlists/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(errorMessageFrom(data, "Couldn't update the playlist."));
        return;
      }
      const updated = (data as { playlist: PlaylistWire & { songIds: string[] } }).playlist;
      setPlaylists((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setDetailSongIds((prev) => ({ ...prev, [updated.id]: updated.songIds }));
      if (successMessage) showToast(successMessage);
    } catch {
      showToast("Couldn't update the playlist.");
    }
  };

  const removePlaylist = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/playlists/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
      setView({ kind: "grid" });
      showToast(`“${name}” deleted — the songs are still in your vault`);
    } catch {
      showToast("Couldn't delete the playlist.");
    }
  };

  const openPlaylist = async (id: string) => {
    setView({ kind: "playlist", id });
    try {
      const res = await fetch(`/api/playlists/${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data: unknown = await res.json();
      const detail = (data as { playlist: PlaylistWire & { songIds: string[] } }).playlist;
      setDetailSongIds((prev) => ({ ...prev, [id]: detail.songIds }));
    } catch {
      // The grid already told us the track count; a failed detail load just
      // shows an empty list rather than breaking the page.
    }
  };

  /* ── Song mutations (shared by every view) ────────────────────────── */

  const toggleFavorite = async (song: SavedSongWire) => {
    const next = !song.favorite;
    setSongs((prev) => prev.map((s) => (s.id === song.id ? { ...s, favorite: next } : s)));
    try {
      const res = await fetch(`/api/songs/${encodeURIComponent(song.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setSongs((prev) => prev.map((s) => (s.id === song.id ? { ...s, favorite: !next } : s)));
      showToast("Couldn't update that — try again");
    }
  };

  const deleteSong = async (song: SavedSongWire) => {
    try {
      const res = await fetch(`/api/songs/${encodeURIComponent(song.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSongs((prev) => prev.filter((s) => s.id !== song.id));
      // Membership cascades server-side; mirror it locally so counts agree.
      setDetailSongIds((prev) => {
        const next: Record<string, string[]> = {};
        for (const [id, ids] of Object.entries(prev)) next[id] = ids.filter((s) => s !== song.id);
        return next;
      });
      setPlaylists((prev) =>
        prev.map((p) =>
          p.coverSongIds.includes(song.id)
            ? { ...p, coverSongIds: p.coverSongIds.filter((s) => s !== song.id) }
            : p
        )
      );
      showToast(`“${song.title}” deleted`);
    } catch {
      showToast("Couldn't delete the song — try again");
    }
  };

  const startUnlock = async (song: SavedSongWire) => {
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: "song_pass", songId: song.id }),
      });
      const data: unknown = await res.json().catch(() => null);
      const url =
        data && typeof data === "object" && "url" in data && typeof data.url === "string"
          ? data.url
          : null;
      if (!res.ok || !url) {
        showToast("Checkout couldn't start — is billing configured?");
        return;
      }
      window.location.assign(url);
    } catch {
      showToast("Checkout couldn't start — try again");
    }
  };

  const shareSong = async (song: SavedSongWire) => {
    if (!song.streamPath) return;
    const shareUrl = new URL("/share", window.location.origin);
    shareUrl.searchParams.set("audio", song.streamPath);
    shareUrl.searchParams.set("title", song.title);
    shareUrl.searchParams.set("song", song.id);
    const url = shareUrl.toString();
    const text = `I made “${song.title}” with Unwritten to share how I’m feeling.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `“${song.title}” — made with Unwritten`, text, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // A browser can advertise sharing and still fail; copying remains useful.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("Song link copied — ready to text");
    } catch {
      showToast("Couldn't copy — your browser blocked it");
    }
  };

  /* ── Render ───────────────────────────────────────────────────────── */

  if (error) {
    return (
      <section className="songs-empty">
        <span aria-hidden="true">♫</span>
        <h1>Something went wrong</h1>
        <p>{error}</p>
        <Link href="/create" className="btn btn-primary">Create a song</Link>
      </section>
    );
  }

  const trackActions = {
    playlists: playlists.map((p) => ({ id: p.id, name: p.name })),
    onToggleFavorite: toggleFavorite,
    onDelete: (song: SavedSongWire) => void deleteSong(song),
    onAddTo: (playlistId: string, songId: string) =>
      void patchPlaylist(playlistId, { add: songId }, "Added to playlist"),
    onRemoveFrom: (playlistId: string, songId: string) =>
      void patchPlaylist(playlistId, { remove: songId }, "Removed from playlist"),
    onUnlock: (song: SavedSongWire) => void startUnlock(song),
    onShare: (song: SavedSongWire) => void shareSong(song),
  };

  // ── Listening room: opened by the featured "continue" card ──
  if (view.kind === "song") {
    const song = songById.get(view.id);
    if (!song) {
      return <section className="songs-empty"><h1>Song not found</h1><button type="button" className="btn btn-primary" onClick={() => setView({ kind: "grid" })}>Back to My Songs</button></section>;
    }
    return (
      <section className="song-room">
        <button type="button" className="song-room-back" onClick={() => setView({ kind: "grid" })}>← Back to My Songs</button>
        <div className="song-room-stage">
          <img src={song.coverArt ?? "/images/collection-hurt.jpg"} alt={song.coverArt ? `Album cover for ${song.title}` : "Rain on a car window at night"} />
          <div className="song-room-copy">
            <p>Now listening</p>
            <h1>{song.title}</h1>
            <span>{song.provider} · {song.unlocked ? "Full song" : "Preview"}</span>
            {song.streamPath ? (
              <AudioPlayer src={song.streamPath} autoPlay />
            ) : (
              <p className="field-hint">This song’s audio is no longer in the listening cache. Generate it again to keep listening.</p>
            )}
            <div className="song-room-actions">
              <button type="button" aria-pressed={song.favorite} onClick={() => void toggleFavorite(song)}>{song.favorite ? "♥ Liked" : "♡ Like"}</button>
              {song.streamPath && <button type="button" onClick={() => void shareSong(song)}>↗ Share</button>}
              {song.downloadable && song.streamPath && <a href={`${song.streamPath}?download=1`} download>↓ Download</a>}
            </div>
          </div>
        </div>
        <details className="song-room-lyrics">
          <summary>Read the lyrics</summary>
          <pre>{lyricsForReading(song.lyrics)}</pre>
        </details>
        {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
      </section>
    );
  }

  // ── Detail: one playlist, or one of the two derived views ──
  if (view.kind !== "grid") {
    const isAuto = view.kind === "auto";
    const playlist = view.kind === "playlist" ? playlists.find((p) => p.id === view.id) : undefined;
    const title = isAuto
      ? view.key === "liked"
        ? "Liked songs"
        : "All songs"
      : (playlist?.name ?? "Playlist");
    const tracks = isAuto
      ? view.key === "liked"
        ? liked
        : songs
      : (detailSongIds[view.id] ?? [])
          .map((id) => songById.get(id))
          .filter((s): s is SavedSongWire => Boolean(s));
    const coverIds = tracks.slice(0, 4).map((s) => s.id);

    if (isAuto && view.key === "all") {
      const term = search.trim().toLocaleLowerCase();
      const moodWords = ["hopeful", "reflective", "warm", "wild", "heavy", "vulnerable", "uplifting", "sad", "happy", "romantic", "nostalgic", "determined", "calm", "dark", "bittersweet"];
      const availableMoods = moodWords.filter((mood) => tracks.some((song) => song.stylePrompt.toLocaleLowerCase().includes(mood)));
      const availableStyles = [...new Set(tracks.map(songDescriptor))].sort((a, b) => a.localeCompare(b));
      const visibleTracks = tracks
        .filter((song) => !term || song.title.toLocaleLowerCase().includes(term) || song.stylePrompt.toLocaleLowerCase().includes(term))
        .filter((song) => moodFilter === "all" || song.stylePrompt.toLocaleLowerCase().includes(moodFilter))
        .filter((song) => styleFilter === "all" || songDescriptor(song) === styleFilter)
        .sort((a, b) => collectionSort === "alpha"
          ? a.title.localeCompare(b.title)
          : collectionSort === "oldest"
            ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const activeSong = tracks.find((song) => song.id === activeSongId) ?? null;
      const playable = tracks.filter((song) => Boolean(song.streamPath));
      const move = (direction: -1 | 1) => {
        if (playable.length === 0) return;
        const current = playable.findIndex((song) => song.id === activeSongId);
        const next = playable[(current < 0 ? 0 : current + direction + playable.length) % playable.length];
        if (next) playSong(next);
      };
      return (
        <section className="all-songs-page">
          <header className="all-songs-hero">
            <div className="all-songs-hero-shade" />
            <button type="button" className="all-songs-back" onClick={() => setView({ kind: "grid" })}>← <span>Playlists</span></button>
            <button type="button" className="all-songs-more" aria-label="More collection actions">•••</button>
            <div className="all-songs-heading">
              <p>Your complete collection</p>
              <h1>All songs</h1>
              <span>Every chapter you’ve turned into music.</span>
              <small>{tracks.length} {tracks.length === 1 ? "song" : "songs"} <i>•</i> Updated today</small>
              <div className="all-songs-play-actions">
                <button type="button" className="all-songs-play" disabled={playable.length === 0} onClick={() => playable[0] && playSong(playable[0])}>▶</button>
                <strong>Play all</strong>
                <button type="button" className="all-songs-shuffle" disabled={playable.length === 0} onClick={() => { const song = playable[Math.floor(Math.random() * playable.length)]; if (song) playSong(song); }}>⌘ <span>Shuffle</span></button>
              </div>
            </div>
          </header>

          <div className="all-songs-library">
            <div className="all-songs-filters">
              <label><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search these songs" /></label>
              <select aria-label="Sort songs" value={collectionSort} onChange={(event) => setCollectionSort(event.target.value as typeof collectionSort)}>
                <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="alpha">A–Z</option>
              </select>
              <select aria-label="Filter by mood" value={moodFilter} onChange={(event) => setMoodFilter(event.target.value)}>
                <option value="all">Mood</option>{availableMoods.map((mood) => <option key={mood} value={mood}>{mood[0]?.toUpperCase()}{mood.slice(1)}</option>)}
              </select>
              <select aria-label="Filter by style" value={styleFilter} onChange={(event) => setStyleFilter(event.target.value)}>
                <option value="all">Style</option>{availableStyles.map((style) => <option key={style} value={style}>{style}</option>)}
              </select>
            </div>
            {visibleTracks.length === 0 ? <p className="tracks-empty">No songs match that search.</p> : (
              <ol className="all-songs-list">
                {visibleTracks.map((song) => (
                  <li key={song.id} className={activeSongId === song.id ? "is-active" : ""}>
                    <button type="button" className="all-song-main" onClick={() => playSong(song)}>
                      <span className="all-song-art" style={song.coverArt ? undefined : { background: artFor(song.id) }}>{song.coverArt && <img src={song.coverArt} alt="" />}<i>{activeSongId === song.id && isPlaying ? "▮▮" : "▶"}</i></span>
                      <span><strong>{song.title}</strong><small>{songDescriptor(song)} <i>•</i> {song.unlocked ? "Full song" : "Preview"}</small></span>
                    </button>
                    <button type="button" className={song.favorite ? "is-liked" : ""} aria-label={song.favorite ? `Unlike ${song.title}` : `Like ${song.title}`} onClick={() => void toggleFavorite(song)}>{song.favorite ? "♥" : "♡"}</button>
                    <button type="button" aria-label={`More actions for ${song.title}`} onClick={() => setView({ kind: "song", id: song.id })}>•••</button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {activeSong?.streamPath && <>
            <audio ref={playerRef} src={activeSong.streamPath} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onTimeUpdate={(event) => setPlayTime(event.currentTarget.currentTime)} onLoadedMetadata={(event) => setPlayDuration(event.currentTarget.duration)} onEnded={() => move(1)} />
            <div className="all-songs-player">
              <button type="button" className="player-collapse" aria-label="Collapse player">⌃</button>
              <span className="player-art" style={activeSong.coverArt ? undefined : { background: artFor(activeSong.id) }}>{activeSong.coverArt && <img src={activeSong.coverArt} alt="" />}</span>
              <span className="player-title"><strong>{activeSong.title}</strong><small>{clock(playTime)}</small></span>
              <span className="player-progress"><i style={{ width: `${playDuration ? (playTime / playDuration) * 100 : 0}%` }} /></span>
              <small>{clock(playDuration)}</small>
              <button type="button" onClick={() => move(-1)} aria-label="Previous song">◀</button>
              <button type="button" className="player-pause" onClick={() => playSong(activeSong)} aria-label={isPlaying ? "Pause" : "Play"}>{isPlaying ? "Ⅱ" : "▶"}</button>
              <button type="button" onClick={() => move(1)} aria-label="Next song">▶</button>
            </div>
          </>}
          {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
        </section>
      );
    }

    return (
      <section className="pl-page">
        <div className="pl-topbar">
          <button
            type="button"
            className="pl-close"
            aria-label="Back to playlists"
            onClick={() => setView({ kind: "grid" })}
          >
            ✕
          </button>
          <span className="pl-crumb">Playlists</span>
        </div>

        <header className="pl-detail-head">
          <CollageArt songIds={coverIds} glyph={isAuto && view.key === "liked" ? "★" : "♪"} />
          <div className="pl-detail-meta">
            {renaming && playlist ? (
              <form
                className="pl-rename"
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = newName.trim();
                  setRenaming(false);
                  if (value && value !== playlist.name) {
                    void patchPlaylist(playlist.id, { name: value }, "Playlist renamed");
                  }
                  setNewName("");
                }}
              >
                <input
                  type="text"
                  autoFocus
                  value={newName}
                  maxLength={80}
                  aria-label="Playlist name"
                  onChange={(e) => setNewName(e.target.value)}
                />
                <button type="submit" className="btn btn-primary btn-sm">Save</button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setRenaming(false);
                    setNewName("");
                  }}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <h1>{title}</h1>
            )}
            <p className="pl-detail-sub">
              {isAuto && <span className="pl-auto-tag">Auto playlist</span>}
              {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
            </p>
            {playlist && !renaming && (
              <div className="action-row">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setNewName(playlist.name);
                    setRenaming(true);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void removePlaylist(playlist.id, playlist.name)}
                >
                  Delete playlist
                </button>
              </div>
            )}
          </div>
        </header>

        <TrackList
          songs={tracks}
          playlistId={view.kind === "playlist" ? view.id : null}
          {...trackActions}
          emptyMessage={
            isAuto
              ? view.key === "liked"
                ? "Nothing liked yet — tap the star on a song."
                : "Your vault is empty. Every song you generate is saved here."
              : "Nothing here yet. Open a song's ⋯ menu to add it to this playlist."
          }
        />

        {toast && (
          <div className="toast" role="status" aria-live="polite">
            {toast}
          </div>
        )}
      </section>
    );
  }

  // ── Grid ──
  const recentSong = songs[0] ?? null;
  return (
    <section className="pl-page pl-library">
      <header className="library-heading">
        <h1>Your songs,<br />in one place.</h1>
        <p>Every feeling you’ve turned into lyrics lives here.</p>
        <span>{songs.length} {songs.length === 1 ? "song" : "songs"} <i>·</i> {playlists.length + 2} collections</span>
      </header>

      <label className="library-search">
        <span aria-hidden="true">⌕</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a song or collection" />
      </label>

      <div className="library-controls">
        <div className="library-tabs" role="group" aria-label="Library view">
          <button type="button" onClick={() => setView({ kind: "auto", key: "all" })}>Songs</button>
          <button type="button" className="is-active">Collections</button>
        </div>
        <div className="pl-sort">
          <button
            type="button"
            className="pl-sort-btn"
            aria-haspopup="listbox"
            aria-expanded={sortOpen}
            onClick={() => setSortOpen((v) => !v)}
          >
            {SORT_LABELS[sort]} <span aria-hidden="true">⌄</span>
          </button>
          {sortOpen && (
            <div className="pl-sort-menu" role="listbox">
              {(Object.keys(SORT_LABELS) as Sort[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={sort === key}
                  onClick={() => {
                    setSort(key);
                    setSortOpen(false);
                  }}
                >
                  {SORT_LABELS[key]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {recentSong && (
        <button type="button" className="continue-song" onClick={() => setView({ kind: "song", id: recentSong.id })}>
          <img src={recentSong.coverArt ?? "/images/collection-hurt.jpg"} alt={recentSong.coverArt ? `Album cover for ${recentSong.title}` : ""} />
          <span className="continue-copy">
            <small>Continue where you left off</small>
            <strong>{recentSong.title}</strong>
            <em>{recentSong.provider} · Saved recently</em>
            <i aria-hidden="true">▶</i>
          </span>
          <b aria-hidden="true">•••</b>
        </button>
      )}

      <div className="collection-title-row">
        <h2>Your collections</h2>
        <button type="button" className="add-playlist-button" onClick={() => setCreating(true)}>＋ Add Playlist</button>
      </div>

      <div className="pl-grid">
        {creating ? (
          <form
            className="pl-tile pl-tile-new is-editing"
            onSubmit={(e) => {
              e.preventDefault();
              void createPlaylist();
            }}
          >
            <div className="pl-art pl-art-new">
              <input
                type="text"
                autoFocus
                value={newName}
                maxLength={80}
                placeholder="Playlist name"
                aria-label="New playlist name"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                  }
                }}
              />
            </div>
            <div className="action-row">
              <button type="submit" className="btn btn-primary btn-sm">Create</button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          null
        )}

        <button
          type="button"
          className="pl-tile"
          onClick={() => setView({ kind: "auto", key: "liked" })}
        >
          <span className="pl-photo-art" style={{ backgroundImage: "url('/images/collection-liked.jpg')" }} />
          <strong><i aria-hidden="true">♡</i> Liked songs</strong>
          <span className="pl-tile-sub">
            {liked.length} {liked.length === 1 ? "song" : "songs"}
          </span>
        </button>

        <button
          type="button"
          className="pl-tile"
          onClick={() => setView({ kind: "auto", key: "all" })}
        >
          <span className="pl-photo-art" style={{ backgroundImage: "url('/images/collection-all.jpg')" }} />
          <strong><i aria-hidden="true">▱</i> All songs</strong>
          <span className="pl-tile-sub">
            {songs.length} {songs.length === 1 ? "song" : "songs"}
          </span>
        </button>

        {visiblePlaylists.map((playlist, index) => (
          <button
            key={playlist.id}
            type="button"
            className="pl-tile"
            onClick={() => void openPlaylist(playlist.id)}
          >
            {index === 0
              ? <span className="pl-photo-art" style={{ backgroundImage: "url('/images/collection-hurt.jpg')" }} />
              : <CollageArt songIds={playlist.coverSongIds} />}
            <strong><i aria-hidden="true">♧</i> {playlist.name}</strong>
            <span className="pl-tile-sub">
              {playlist.trackCount} {playlist.trackCount === 1 ? "song" : "songs"}
            </span>
          </button>
        ))}
      </div>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </section>
  );
}
