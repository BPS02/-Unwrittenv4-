"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasPerformanceTags, lyricsForReading } from "@/lib/lyrics-display";
import type { SongControls, SongInput } from "@/lib/types";

const WRITING_MESSAGES = [
  "Listening to what you wrote.",
  "Finding the images worth keeping.",
  "Setting your words to a rhythm.",
  "Shaping verses and a chorus.",
];

export interface SongDraft {
  title: string;
  lyrics: string;
  mode: "demo" | "live";
  /** The generator's STYLE production brief — travels into the music request.
   *  Optional so drafts saved before it existed still restore. */
  style?: string;
  model?: string;
}

interface LyricsStepProps {
  status: "loading" | "error" | "ready";
  error: string | null;
  song: SongDraft | null;
  input: SongInput;
  controls: SongControls;
  onTitleChange: (title: string) => void;
  onLyricsChange: (lyrics: string) => void;
  onAnotherTake: () => void;
  onRetry: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onBack: () => void;
  onBackToShape: () => void;
  onContinue: () => void;
}

export default function LyricsStep(props: LyricsStepProps) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const tagged = hasPerformanceTags(props.song?.lyrics ?? "");

  useEffect(() => {
    if (props.status !== "loading") return;
    setMsgIndex(0);
    const interval = setInterval(
      () => setMsgIndex((index) => (index + 1) % WRITING_MESSAGES.length),
      2600
    );
    return () => clearInterval(interval);
  }, [props.status]);

  if (props.status === "loading") {
    return (
      <div className="step-panel loading-stage" role="status" aria-live="polite">
        <div className="breath" aria-hidden="true"><span /><span /><span /><span /></div>
        <p>{WRITING_MESSAGES[msgIndex]}</p>
      </div>
    );
  }

  if (props.status === "error") {
    return (
      <div className="step-panel">
        <div className="banner banner-error" role="alert">
          <h3>Your words are safe — the writing didn&apos;t finish</h3>
          <p>{props.error ?? "Something went wrong while writing your lyrics."}</p>
          <div className="banner-actions action-row">
            <button type="button" className="btn btn-primary btn-sm" onClick={props.onRetry}>Try again</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={props.onBack}>Back to questions</button>
          </div>
        </div>
      </div>
    );
  }

  if (!props.song) {
    return (
      <div className="step-panel empty-state">
        <span className="glyph" aria-hidden="true">♫</span>
        <p>No lyrics yet — head back and write your lyrics first.</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={props.onBack}>← Back</button>
      </div>
    );
  }

  const { song } = props;
  const themeWords = [
    props.controls.mood,
    props.controls.genre,
    props.controls.lyricalStyle,
    ...props.input.feelings.slice(0, 2),
  ].filter((value, index, all) => value && all.indexOf(value) === index);

  return (
    <div className="step-panel lyrics-workspace">
      <aside className="lyrics-rail" aria-label="Workspace navigation">
        <Link href="/">⌂<span>Home</span></Link>
        <button type="button" className="is-current">✎<span>Create</span></button>
        <Link href="/songs">♫<span>My Songs</span></Link>
        <Link href="/connect">♧<span>Connect</span></Link>
        <Link href="/plans">♕<span>Plans</span></Link>
      </aside>

      <div className="lyrics-main">
        <header className="lyrics-workspace-head">
          <label className="sr-only" htmlFor="song-title">Song title</label>
          <input
            id="song-title"
            type="text"
            className="song-title-input"
            value={song.title}
            maxLength={200}
            onChange={(event) => props.onTitleChange(event.target.value)}
          />
          <div className="lyrics-status-row">
            <span className={`badge ${song.mode === "demo" ? "badge-demo" : "badge-live"}`}>
              {song.mode === "demo" ? "Demo mode" : "● AI written"}
            </span>
            <span className="lyrics-saved">♧ Saved in this session</span>
          </div>
        </header>

        <div className="lyrics-editor-grid">
          <section className="lyrics-editor-card">
            <div className="lyrics-card-actions">
              <button type="button" onClick={() => setEditing((value) => !value)}>✎ {editing ? "Done" : "Edit"}</button>
              <button type="button" onClick={props.onCopy}>▣ Copy</button>
              <button type="button" onClick={props.onDownload}>↓ Download</button>
            </div>

            <label className="sr-only" htmlFor="lyrics-sheet">Lyrics — edit freely</label>
            {editing ? (
              <textarea
                id="lyrics-sheet"
                className="lyrics-sheet lyrics-workspace-sheet"
                value={song.lyrics}
                spellCheck={false}
                onChange={(event) => props.onLyricsChange(event.target.value)}
              />
            ) : (
              <pre className="lyrics-sheet lyrics-sheet-read lyrics-workspace-sheet">{lyricsForReading(song.lyrics)}</pre>
            )}
            <p className="lyrics-card-note">
              {editing && tagged
                ? "Bracketed tags guide the performance and stay with your song."
                : "These lyrics stay editable until you continue to music."}
            </p>
          </section>

          <aside className="lyrics-insights">
            <section className="lyrics-side-card">
              <h2><span>✧</span> Tools</h2>
              <button type="button" onClick={props.onAnotherTake}>↻ Rewrite the song</button>
              <button type="button" onClick={() => setEditing(true)}>✎ Edit individual lines</button>
              <button type="button" onClick={props.onCopy}>▣ Copy lyrics</button>
              <button type="button" onClick={props.onDownload}>↓ Download lyrics</button>
              <button type="button" onClick={props.onBackToShape}>⌁ Change sound &amp; style</button>
            </section>

            <section className="lyrics-side-card">
              <h2><span>◉</span> Mood &amp; Theme</h2>
              <ul>{themeWords.map((word) => <li key={word}>◇ {word}</li>)}</ul>
            </section>

            <blockquote className="lyrics-quote">
              “{props.input.thought}”
              <cite>— You</cite>
            </blockquote>
          </aside>
        </div>

        <div className="lyrics-audio-preview">
          <div className="lyrics-album-art" aria-hidden="true">♫</div>
          <div className="lyrics-audio-copy"><strong>{song.title}</strong><span>Audio is created on the next step</span></div>
          <button type="button" className="lyrics-play-disabled" disabled aria-label="Audio available after music generation">▶</button>
          <div className="lyrics-audio-track" aria-hidden="true"><span /></div>
          <button type="button" className="btn btn-primary" onClick={props.onContinue}>Continue to music →</button>
        </div>

        <div className="lyrics-bottom-actions">
          <button type="button" className="btn btn-secondary" onClick={props.onBack}>← Back to questions</button>
        </div>
      </div>
    </div>
  );
}
