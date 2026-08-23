"use client";

export type FlowStep = "write" | "shape" | "questions" | "lyrics" | "music";

export const STEP_ORDER: readonly FlowStep[] = [
  "write",
  "shape",
  "questions",
  "lyrics",
  "music",
];

const STEP_LABELS: Record<FlowStep, string> = {
  write: "Write",
  shape: "Shape",
  questions: "Questions",
  lyrics: "Lyrics",
  music: "Music",
};

interface StepperProps {
  current: FlowStep;
  /** Highest step the user has reached (steps up to this are navigable). */
  reached: FlowStep;
  onNavigate: (step: FlowStep) => void;
}

export default function Stepper({ current, reached, onNavigate }: StepperProps) {
  const currentIdx = STEP_ORDER.indexOf(current);
  const reachedIdx = STEP_ORDER.indexOf(reached);
  return (
    <ol className="stepper" aria-label="Song creation steps">
      {STEP_ORDER.map((step, i) => {
        const isCurrent = i === currentIdx;
        const isDone = i <= reachedIdx && !isCurrent;
        return (
          <li key={step}>
            {/* A drawn connector reads quieter than an arrow glyph. */}
            {i > 0 && <span className="sep" aria-hidden="true" />}
            <button
              type="button"
              className={`step-pill${isCurrent ? " current" : ""}${isDone ? " done" : ""}`}
              aria-current={isCurrent ? "step" : undefined}
              disabled={!isDone && !isCurrent}
              onClick={() => isDone && onNavigate(step)}
            >
              {STEP_LABELS[step]}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
