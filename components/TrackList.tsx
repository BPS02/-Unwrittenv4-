"use client";

import { useState } from "react";
import { artFor } from "@/lib/cover-art";
import { lyricsForReading } from "@/lib/lyrics-display";
import AudioPlayer from "./AudioPlayer";
import type { SavedSongWire } from "./PlaylistsView";

interface TrackListProps {
  songs: SavedSongWire[];
  /** Present when viewing a real playlist — enables "remove from playlist". */
  playlistId: string | null;
  /** User playlists a track can be added to. */
  playlists: Array<{ id: string; name: string }>;
  onToggleFavorite: (song: SavedSongWire) => void;
  onDelete: (song: SavedSongWire) => void;
  onAddTo: (playlistId: string, songId: string) => void;
  onRemoveFrom: (playlistId: string, songId: string) => void;
  onUnlock: (song: SavedSongWire) => void;
  onShare: (song: SavedSongWire) => void;
  emptyMessage: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** The track rows inside a playlist — the vault's old list, rebuilt for it. */
export default function TrackList(props: TrackListProps) {
  const { songs, playlistId, playlists } = props;
  const [openId, setOpenId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [durations, setDurations] = useState<Record<string, number>>({});

  if (songs.length === 0) {
    return <p className="tracks-empty">{props.emptyMessage}</p>;
  }

  return (
    <ol className="track-list">
      {songs.map((song, i) => {
        const open = openId === song.id;
        const duration = durations[song.id];
        return (
          <li key={song.id} className={`track${open ? " is-open" : ""}`}>
            <div className="track-row">
              <span className="track-index" aria-hidden="true">
                {i + 1}
              </span>
              <button
                type="button"
                className="track-main"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : song.id)}
              >
                <span className="track-art" style={song.coverArt ? undefined : { background: artFor(song.id) }} aria-hidden="true">
                  {song.coverArt ? <img src={song.coverArt} alt="" /> : "♪"}
                </span>
                <span className="track-info">
                  <strong>{song.title}</strong>
                  <span className="track-meta">
                    {formatDate(song.createdAt)}
                    {duration !== undefined && <> · {formatDuration(duration)}</>}
                    {!song.unlocked && <> · Preview</>}
                  </span>
                </span>
              </button>

              <button
                type="button"
                className={`track-star${song.favorite ? " is-fav" : ""}`}
                aria-pressed={song.favorite}
                aria-label={song.favorite ? `Unlike “${song.title}”` : `Like “${song.title}”`}
                onClick={() => props.onToggleFavorite(song)}
              >
                {song.favorite ? "★" : "☆"}
              </button>

              {song.streamPath && (
                <button
                  type="button"
                  className="track-share"
                  aria-label={`Share “${song.title}” by text or another app`}
                  onClick={() => props.onShare(song)}
                >
                  <span aria-hidden="true">↗</span>
                  <span>Share</span>
                </button>
              )}

              <div className="track-menu-wrap">
                <button
                  type="button"
                  className="track-menu-btn"
                  aria-haspopup="menu"
                  aria-expanded={menuFor === song.id}
                  aria-label={`More actions for “${song.title}”`}
                  onClick={() => setMenuFor(menuFor === song.id ? null : song.id)}
                >
                  ⋯
                </button>
                {menuFor === song.id && (
                  <div className="track-menu" role="menu">
                    {playlistId && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          props.onRemoveFrom(playlistId, song.id);
                          setMenuFor(null);
                        }}
                      >
                        Remove from this playlist
                      </button>
                    )}
                    {playlists.length > 0 && <span className="track-menu-label">Add to playlist</span>}
                    {playlists
                      .filter((p) => p.id !== playlistId)
                      .map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            props.onAddTo(p.id, song.id);
                            setMenuFor(null);
                          }}
                        >
                          {p.name}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {open && (
              <div className="track-detail">
                {song.streamPath ? (
                  <AudioPlayer
                    compact
                    src={song.streamPath}
                    onDuration={(secs) =>
                      setDurations((prev) => ({ ...prev, [song.id]: secs }))
                    }
                  />
                ) : (
                  <p className="field-hint">
                    This song&apos;s audio has expired from the listening cache. Generate it again to
                    keep listening.
                  </p>
                )}

                <div className="action-row">
                  {!song.unlocked && song.streamPath && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => props.onUnlock(song)}
                    >
                      Get Song Pass — $9.99
                    </button>
                  )}
                  {song.streamPath && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => props.onShare(song)}
                    >
                      Share how I feel
                    </button>
                  )}
                  {song.downloadable && song.streamPath && (
                    <a
                      className="btn btn-secondary btn-sm"
                      href={`${song.streamPath}?download=1`}
                      download
                    >
                      Download
                    </a>
                  )}
                  {confirmingDelete === song.id ? (
                    <span className="action-row" role="group" aria-label="Confirm deletion">
                      <span style={{ alignSelf: "center", fontSize: "0.88rem" }}>Delete forever?</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setConfirmingDelete(null)}
                      >
                        Keep it
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setConfirmingDelete(null);
                          props.onDelete(song);
                        }}
                      >
                        Yes, delete
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setConfirmingDelete(song.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>

                <details className="song-lyrics">
                  <summary>Lyrics</summary>
                  <pre>{lyricsForReading(song.lyrics)}</pre>
                </details>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
