"use client";

import { useId } from "react";
import type { Genre, Mood, SongControls, SongInput } from "@/lib/types";
import {
  GENRES,
  MOODS,
  VOCALISTS,
  type LyricalStyle,
  type Perspective,
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

function PlainChoice<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; icon: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <section className="plain-choice" aria-labelledby={id}>
      <h3 id={id}>{props.label}</h3>
      <div className="plain-choice-list" role="radiogroup" aria-labelledby={id}>
        {props.options.map((option) => (
          <button key={option.value} type="button" role="radio" aria-checked={props.value === option.value}
            onClick={() => props.onChange(option.value)}>
            <span aria-hidden="true">{props.value === option.value ? "✓" : option.icon}</span>
            <strong>{option.label}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

const STORY_CHOICES: readonly { value: Perspective; label: string; icon: string }[] = [
  { value: "First person (I)", label: "Me, telling my story", icon: "♙" },
  { value: "Second person (you)", label: "Me, talking to someone", icon: "♧" },
  { value: "Third person (story)", label: "A story about someone else", icon: "○" },
];

const WORD_CHOICES: readonly { value: LyricalStyle; label: string; icon: string }[] = [
  { value: "Plainspoken", label: "Simple and direct", icon: "○" },
  { value: "Poetic & metaphorical", label: "Poetic and visual", icon: "❧" },
  { value: "Storytelling", label: "Like a conversation", icon: "◯" },
];

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

        <section className="shape-simple-controls">
          <div className="shape-simple-heading">
            <h2>Tell us how you want it to sound</h2>
            <p>There are no wrong choices.</p>
          </div>
          <div className="toggle-row">
            <div className="toggle-copy">
              <strong>Keep the language clean</strong>
              <span>No explicit words</span>
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
          <PlainChoice label="Who is telling the story?" value={controls.perspective} options={STORY_CHOICES} onChange={(perspective) => onControlsChange({ perspective })} />
          <PlainChoice label="How should the words feel?" value={controls.lyricalStyle} options={WORD_CHOICES} onChange={(lyricalStyle) => onControlsChange({ lyricalStyle })} />
          <PlainChoice label="Who should sing it?" value={controls.vocalist}
            options={VOCALISTS.map((value) => ({ value, label: value, icon: value === "Female voice" ? "♀" : value === "Male voice" ? "♂" : "✦" }))}
            onChange={(vocalist) => onControlsChange({ vocalist })} />
          <div className="shape-auto-card"><span aria-hidden="true">✦</span><div><strong>We’ll shape the song for you</strong><small>We’ll give your story the structure that fits.</small></div><span aria-hidden="true">✓</span></div>
        </section>

        <div className="shape-summary" aria-label="Your song direction">
          <span className="shape-overline">Your song</span>
          <p><span aria-hidden="true">{GENRE_EMOJI[controls.genre]}</span> {controls.genre} <i>·</i> <span aria-hidden="true">{MOOD_EMOJI[controls.mood]}</span> {controls.mood}</p>
          <small>{STORY_CHOICES.find((choice) => choice.value === controls.perspective)?.label} · {WORD_CHOICES.find((choice) => choice.value === controls.lyricalStyle)?.label} · {controls.vocalist}</small>
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
