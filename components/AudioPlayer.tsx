"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface AudioPlayerProps {
  src: string;
  /** Fired once metadata gives a real duration, so callers can cache it. */
  onDuration?: (seconds: number) => void;
  onEnded?: () => void;
  /** Compact variant for dense lists. */
  compact?: boolean;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The song player.
 *
 * Replaces the browser's default `<audio controls>`, which renders a grey
 * chrome bar that belongs to no design system and looks different in every
 * browser. The audio element is still what plays — it is just not what you
 * see, so the paywall, the token URL and the streaming behaviour are all
 * unchanged.
 *
 * Progress is driven by requestAnimationFrame rather than the `timeupdate`
 * event: that event fires about four times a second, which reads as a
 * stuttering bar. rAF runs only while playing, so an idle player costs
 * nothing.
 */
export default function AudioPlayer({ src, onDuration, onEnded, compact }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  /** While dragging, the bar follows the pointer, not the audio clock. */
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubTo, setScrubTo] = useState(0);
  const [failed, setFailed] = useState(false);

  const shown = scrubbing ? scrubTo : current;
  const progress = duration > 0 ? Math.min(1, shown / duration) : 0;
  const bufferedPct = duration > 0 ? Math.min(1, buffered / duration) : 0;

  // Smooth progress while playing.
  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        setCurrent(audio.currentTime);
        const ranges = audio.buffered;
        if (ranges.length > 0) setBuffered(ranges.end(ranges.length - 1));
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [playing]);

  // A new source is a new song: reset rather than showing the old position.
  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setBuffered(0);
    setFailed(false);
  }, [src]);

  const seekToClientX = useCallback(
    (clientX: number): number => {
      const bar = barRef.current;
      if (!bar || duration <= 0) return 0;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration]
  );

  // Pointer capture keeps the drag alive outside the bar, which is where a
  // pointer usually ends up on a control this thin.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setScrubbing(true);
    setScrubTo(seekToClientX(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    setScrubTo(seekToClientX(e.clientX));
  };
  const commitScrub = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    const to = seekToClientX(e.clientX);
    const audio = audioRef.current;
    if (audio) audio.currentTime = to;
    setCurrent(to);
    setScrubbing(false);
  };

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setFailed(true);
      }
    } else {
      audio.pause();
    }
  };

  const nudge = (delta: number) => {
    const audio = audioRef.current;
    if (!audio || duration <= 0) return;
    const to = Math.min(duration, Math.max(0, audio.currentTime + delta));
    audio.currentTime = to;
    setCurrent(to);
  };

  return (
    <div className={`player${compact ? " is-compact" : ""}${playing ? " is-playing" : ""}`}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
          onEnded?.();
        }}
        onError={() => setFailed(true)}
        onLoadedMetadata={(e) => {
          const secs = e.currentTarget.duration;
          if (Number.isFinite(secs)) {
            setDuration(secs);
            onDuration?.(secs);
          }
        }}
        onProgress={(e) => {
          const ranges = e.currentTarget.buffered;
          if (ranges.length > 0) setBuffered(ranges.end(ranges.length - 1));
        }}
      />

      <button
        type="button"
        className="player-play"
        onClick={() => void toggle()}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="7" y="5" width="3.6" height="14" rx="1.1" />
            <rect x="13.4" y="5" width="3.6" height="14" rx="1.1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8.5 5.4v13.2a.7.7 0 0 0 1.07.6l10.2-6.6a.7.7 0 0 0 0-1.2L9.57 4.8a.7.7 0 0 0-1.07.6Z" />
          </svg>
        )}
      </button>

      <span className="player-time">{formatTime(shown)}</span>

      <div
        ref={barRef}
        className={`player-bar${scrubbing ? " is-scrubbing" : ""}`}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={`${formatTime(shown)} of ${formatTime(duration)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={commitScrub}
        onPointerCancel={commitScrub}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); nudge(5); }
          if (e.key === "ArrowLeft") { e.preventDefault(); nudge(-5); }
          if (e.key === " " || e.key === "Enter") { e.preventDefault(); void toggle(); }
        }}
      >
        <span className="player-track" aria-hidden="true">
          {/* What has downloaded, behind what has played. */}
          <span className="player-buffered" style={{ transform: `scaleX(${bufferedPct})` }} />
          <span className="player-fill" style={{ transform: `scaleX(${progress})` }} />
        </span>
        <span className="player-thumb" style={{ left: `${progress * 100}%` }} aria-hidden="true" />
      </div>

      <span className="player-time player-duration">{formatTime(duration)}</span>

      {failed && <span className="player-failed">Couldn’t play this</span>}
    </div>
  );
}
