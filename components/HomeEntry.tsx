"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AccountControls from "./AccountControls";
import { DRAFT_KEY, PENDING_ACTION_KEY, packExpiring, unpackExpiring } from "@/lib/draft-storage";
import { DEFAULT_CONTROLS, EMPTY_INPUT, type SongControls, type SongInput } from "@/lib/types";
import { MAX_THOUGHT_LENGTH, MIN_THOUGHT_WORDS, thoughtWordCount } from "@/lib/validation";

export const SENTENCE_STARTERS = [
  "I keep thinking about…",
  "I never told you…",
  "It’s been a year since…",
  "Lately I feel like…",
  "The last time I saw you…",
] as const;

/**
 * The stages of making a song, shown so step one feels like a journey.
 * Keep in step with STEP_ORDER in components/Stepper.tsx — this strip is a
 * promise about what happens next, and it was silently a step short when the
 * Questions step landed.
 */
const JOURNEY = ["Write", "Shape", "Questions", "Lyrics", "Music"] as const;

/**
 * Ambient hero video. Read at build time (NEXT_PUBLIC_), so an unset value
 * removes the element entirely rather than shipping a broken source.
 * Point it at a file in /public, e.g. "/hero.mp4".
 */
const HERO_VIDEO = process.env.NEXT_PUBLIC_HERO_VIDEO || "";
// Defaults to the still the page already uses, so the first paint is
// identical whether or not the video ever loads.
const HERO_POSTER = process.env.NEXT_PUBLIC_HERO_POSTER || "/images/home-twilight.png";

interface StoredDraft {
  input?: SongInput;
  controls?: SongControls;
  mode?: string;
}

export default function HomeEntry({ clerkEnabled = true }: { clerkEnabled?: boolean }) {
  const router = useRouter();
  const [thought, setThought] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const draft = unpackExpiring<StoredDraft>(sessionStorage.getItem(DRAFT_KEY));
    if (draft?.mode === "freeform" && draft.input?.thought) setThought(draft.input.thought);
  }, []);

  function continueWithThought(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = thought.trim();
    if (thoughtWordCount(value) < MIN_THOUGHT_WORDS) {
      setError("Share at least a few words to begin.");
      return;
    }
    if (value.length > MAX_THOUGHT_LENGTH) {
      setError("Please keep this under 2,000 characters.");
      return;
    }

    const previous = unpackExpiring<StoredDraft>(sessionStorage.getItem(DRAFT_KEY));
    sessionStorage.setItem(DRAFT_KEY, packExpiring({
      step: "shape",
      reached: "shape",
      mode: "freeform",
      input: { ...EMPTY_INPUT, ...previous?.input, thought: value, templateId: undefined },
      controls: { ...DEFAULT_CONTROLS, ...previous?.controls },
      variation: 0,
      song: null,
    }));
    router.push("/create");
  }

  function resetEverything() {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
      sessionStorage.removeItem(PENDING_ACTION_KEY);
    } catch {
      // Storage may be unavailable; clearing the field still helps.
    }
    setThought("");
    setError(null);
    textareaRef.current?.focus();
  }

  function insertStarter(starter: string) {
    if (thought) return;
    setThought(starter);
    setError(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(starter.length, starter.length);
    });
  }

  const nearLimit = thought.length > MAX_THOUGHT_LENGTH - 200;

  return (
    <section className={`opening-page${thought ? " is-writing" : ""}`}>
      {/*
        Ambient hero video, behind everything. Only rendered when
        NEXT_PUBLIC_HERO_VIDEO names a file in /public — with no file the
        page keeps the gradient it has always had, so this can ship before
        the asset does and never 404s.

        `poster` is the still, so the first paint is identical whether or not
        the video ever loads. `preload="none"` keeps it off the critical path;
        it is decoration, and the box someone types into must not wait for it.
      */}
      {HERO_VIDEO && (
        <video
          className="opening-video"
          aria-hidden="true"
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          poster={HERO_POSTER}
          src={HERO_VIDEO}
        />
      )}
      {/*
        The page's own background carries darkening veils that keep the
        headline legible. A negative-z-index child paints ABOVE a parent's
        background, so the video would land on top of those veils — this
        replaces them over the video.
      */}
      {HERO_VIDEO && <div className="opening-scrim" aria-hidden="true" />}
      <div className="opening-waves" aria-hidden="true">
        <span className="opening-wave opening-wave-one" />
        <span className="opening-wave opening-wave-two" />
        <span className="opening-wave opening-wave-three" />
      </div>
      <div className="opening-grain" aria-hidden="true" />
      <div className="opening-brand" aria-label="Unwritten">
        <svg viewBox="0 0 46 24" role="img" aria-label="Flowing wave"><path d="M2 12c5.2 0 5.2-7 10.4-7s5.2 14 10.4 14S28 5 33.2 5 38.4 12 44 12" /></svg>
        <span>UNWRITTEN</span>
      </div>
      <div className="opening-account"><AccountControls enabled={clerkEnabled} compact /></div>

      <div className="opening-content">
        <ol className="opening-journey" aria-label="How a song gets made">
          {JOURNEY.map((stage, index) => (
            <li key={stage} className={index === 0 ? "is-current" : undefined} aria-current={index === 0 ? "step" : undefined}>
              <span className="opening-journey-dot" aria-hidden="true" />
              <span className="opening-journey-label">{stage}</span>
            </li>
          ))}
        </ol>

        <header className="opening-copy">
          <p className="opening-eyebrow">Write it <span aria-hidden="true">·</span> Answer <span aria-hidden="true">·</span> Hear it</p>
          <h1>The details are what make it <em>yours</em>.</h1>
          <p className="opening-sub">Tell us the moment.<br />We’ll ask what only you could know — then write the lyrics around it.</p>
        </header>

        <form className="opening-card" onSubmit={continueWithThought} noValidate>
          <div className="opening-card-glow" aria-hidden="true" />
          <label className="opening-card-label" htmlFor="opening-thought">
            <span className="opening-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M4.2 16.5l2.6-1.5M17.2 9l2.6-1.5" strokeLinecap="round" /><circle cx="12" cy="12" r="3.4" /></svg>
            </span>
            What’s on your mind?
          </label>

          <div className={`opening-input-shell${error ? " has-error" : ""}`}>
            <textarea
              ref={textareaRef}
              id="opening-thought"
              value={thought}
              onChange={(event) => { setThought(event.target.value); setError(null); }}
              placeholder="Write a thought, memory, confession, or feeling…"
              rows={4}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "opening-error" : "opening-help"}
              autoFocus
            />
          </div>

          <div className="opening-meta">
            <p className="opening-help" id="opening-help">One to three sentences is plenty. <span className="opening-help-quiet">Share only what you want to.</span></p>
            {thought.length > 0 && (
              <span className={`opening-count${nearLimit ? " is-near" : ""}`} aria-live="polite">
                {thought.length.toLocaleString()} / {MAX_THOUGHT_LENGTH.toLocaleString()}
              </span>
            )}
          </div>

          {error && <p id="opening-error" className="opening-error" role="alert">{error}</p>}

          {!thought && <div className="opening-starters">
            <span>Not sure where to start?</span>
            <div>{SENTENCE_STARTERS.map((starter) => <button key={starter} type="button" className="opening-chip" onClick={() => insertStarter(starter)}>{starter}</button>)}</div>
          </div>}

          <button type="submit" className="opening-primary">Turn this into lyrics <span aria-hidden="true">→</span></button>
          <button type="button" className="opening-reset" onClick={resetEverything} title="Clears your thought and everything carried over from your last song — feelings, personal details, and settings.">
            ↺ Start completely fresh
          </button>
        </form>

        <div className="opening-paths" role="group" aria-label="Ways to begin">
          <button type="button" className="opening-path is-current" onClick={() => textareaRef.current?.focus()}>
            <span className="opening-path-title">Write freely</span>
            <span className="opening-path-note">Begin from your own words</span>
          </button>
          <button type="button" className="opening-path" onClick={() => router.push("/create/start")}>
            <span className="opening-path-title">Browse templates</span>
            <span className="opening-path-note">Start from a prompt we wrote</span>
          </button>
        </div>
      </div>
    </section>
  );
}
