"use client";

import { useId } from "react";
import type { Genre, Mood, SongControls, SongInput } from "@/lib/types";
import {
  GENRES,
  LYRICAL_STYLES,
  MOODS,
  PERSPECTIVES,
  STRUCTURES,
} from "@/lib/types";

interface ShapeStepProps {
  input: SongInput;
  controls: SongControls;
  onControlsChange: (patch: Partial<SongControls>) => void;
  onBack: () => void;
  onGenerate: () => void;
}

const GENRE_EMOJI: Record<Genre, string> = {
  Pop: "🎤",
  "Acoustic / Folk": "🪕",
  "R&B / Soul": "🎷",
  Indie: "🌙",
  Rock: "🎸",
  Country: "🤠",
  "Hip-Hop": "🎧",
  Electronic: "⚡",
  "Lo-fi": "☕",
};

const MOOD_EMOJI: Record<Mood, string> = {
  Hopeful: "🌅",
  Bittersweet: "🍂",
  Melancholy: "🌧️",
  Peaceful: "🕊️",
  Uplifting: "☀️",
  "Raw & honest": "💬",
  Playful: "🎈",
  Cinematic: "🎬",
};

function ChipPicker<T extends string>(props: {
  label: string;
  hint: string;
  kind: "sound" | "feeling";
  value: T;
  options: readonly T[];
  emoji: Record<T, string>;
  onChange: (value: T) => void;
}) {
  const labelId = useId();
  return (
    <section className={`shape-choice shape-choice-${props.kind}`}>
      <h2 className="shape-choice-title" id={labelId}>{props.label}</h2>
      <p className="shape-choice-hint">{props.hint}</p>
      <div className="shape-chip-row" role="radiogroup" aria-labelledby={labelId}>
        {props.options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            className="shape-chip"
            aria-checked={props.value === option}
            onClick={() => props.onChange(option)}
          >
            <span className="shape-chip-emoji" aria-hidden="true">
              {props.emoji[option]}
            </span>
            <span>{option}</span>
            {props.value === option && <span className="shape-choice-check" aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
    </section>
  );
}

function SelectField<T extends string>(props: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {props.label}
      </label>
      <select
        id={id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as T)}
      >
        {props.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function ShapeStep(props: ShapeStepProps) {
  const { input, controls, onControlsChange, onBack, onGenerate } = props;
  const excerpt =
    input.thought.length > 120 ? `${input.thought.slice(0, 120)}…` : input.thought;
  const shortGenre = controls.genre === "Acoustic / Folk" ? "folk" : controls.genre.toLowerCase();

  return (
    <div className="step-panel shape-screen">
      <div className="step-heading shape-heading">
        <h1>Shape <em>the song</em></h1>
        <p>Give your story a sound.</p>
      </div>

      <div className="shape-thought">
        <span className="shape-overline">Your thought</span>
        <div className="shape-thought-row">
          <span className="shape-quote" aria-hidden="true">“</span>
          <strong>{excerpt}</strong>
          <button type="button" className="shape-thought-edit" onClick={onBack} aria-label="Edit your thought">
            ✎
          </button>
        </div>
      </div>

      <div className="shape-builder">
        <ChipPicker
          label="1. Choose a sound"
          hint="What type of music fits your story?"
          kind="sound"
          value={controls.genre}
          options={GENRES}
          emoji={GENRE_EMOJI}
          onChange={(genre) => onControlsChange({ genre })}
        />
        <ChipPicker
          label="2. Choose the feeling"
          hint="What emotion should your song carry?"
          kind="feeling"
          value={controls.mood}
          options={MOODS}
          emoji={MOOD_EMOJI}
          onChange={(mood) => onControlsChange({ mood })}
        />

        <details className="advanced-options shape-advanced">
          <summary>Fine-tune the lyrics</summary>
          <div className="toggle-row">
            <div className="toggle-copy">
              <strong>Keep the language clean</strong>
              <span>Avoid explicit language in the lyrics.</span>
            </div>
            <button
              type="button"
              role="switch"
              className="switch"
              aria-checked={controls.keepClean}
              aria-label="Keep the language clean"
              onClick={() => onControlsChange({ keepClean: !controls.keepClean })}
            />
          </div>
          <div className="controls-grid">
            <SelectField label="Perspective" value={controls.perspective} options={PERSPECTIVES} onChange={(perspective) => onControlsChange({ perspective })} />
            <SelectField label="Lyrical style" value={controls.lyricalStyle} options={LYRICAL_STYLES} onChange={(lyricalStyle) => onControlsChange({ lyricalStyle })} />
            <SelectField label="Structure" value={controls.structure} options={STRUCTURES} onChange={(structure) => onControlsChange({ structure })} />
          </div>
        </details>

        <div className="shape-summary" aria-label="Your song direction">
          <span className="shape-overline">Your song</span>
          <p><span aria-hidden="true">{GENRE_EMOJI[controls.genre]}</span> {controls.genre} <i>·</i> <span aria-hidden="true">{MOOD_EMOJI[controls.mood]}</span> {controls.mood}</p>
        </div>

        <button type="button" className="shape-generate" onClick={onGenerate}>
          <span aria-hidden="true">✦</span>
          Write my {controls.mood.toLowerCase()} {shortGenre} song
          <span aria-hidden="true">→</span>
        </button>
        <p className="shape-change-note">♙ You can change these later</p>
      </div>
    </div>
  );
}
