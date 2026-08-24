"use client";

import { useEffect, useId, useState } from "react";
import type { SongQuestion } from "@/lib/types";
import { MAX_ANSWER_LENGTH } from "@/lib/validation";

export type QuestionsStatus = "loading" | "error" | "ready";

interface QuestionsStepProps {
  status: QuestionsStatus;
  error: string | null;
  questions: SongQuestion[];
  /** questionId → answer text. */
  answers: Record<string, string>;
  /** Ids the user tried to continue without answering. */
  missing: string[];
  onAnswerChange: (id: string, value: string) => void;
  onRetry: () => void;
  onBack: () => void;
  onContinue: () => void;
  /** Shown only after a generation failure — never a general skip. */
  onContinueWithout: () => void;
}

/**
 * The follow-up questions step.
 *
 * Questions are written by the model from what the writer said, so this step
 * has three genuinely different states: waiting for them, failing to get them,
 * and answering them. Every question must be answered before the lyrics are
 * written — the only way past an unanswered set is a generation failure.
 */
export default function QuestionsStep(props: QuestionsStepProps) {
  const {
    status,
    error,
    questions,
    answers,
    missing,
    onAnswerChange,
    onRetry,
    onBack,
    onContinue,
    onContinueWithout,
  } = props;
  const [currentIndex, setCurrentIndex] = useState(0);
  const answerId = useId();
  const errorId = `${answerId}-error`;

  useEffect(() => {
    setCurrentIndex((index) => Math.min(index, Math.max(questions.length - 1, 0)));
  }, [questions.length]);

  useEffect(() => {
    if (missing.length === 0) return;
    const firstMissingIndex = questions.findIndex((question) => missing.includes(question.id));
    if (firstMissingIndex >= 0) setCurrentIndex(firstMissingIndex);
  }, [missing, questions]);

  if (status === "loading") {
    return (
      <div className="step-panel questions-loading" role="status" aria-live="polite">
        <div className="questions-aurora" aria-hidden="true">
          <span className="aurora-ribbon aurora-ribbon-one" />
          <span className="aurora-ribbon aurora-ribbon-two" />
          <span className="aurora-ribbon aurora-ribbon-three" />
        </div>

        <div className="questions-loading-copy">
          <div className="questions-pulse" aria-hidden="true">
            <svg viewBox="0 0 96 52" fill="none">
              <path d="M5 28h14l7-10 9 25 12-37 12 40 8-21 7 9h17" />
            </svg>
          </div>
          <h1>Turning thoughts<br />into questions.</h1>
          <p>We’re preparing a path that<br />leads to your best lyrics.</p>
        </div>

        <div className="questions-loading-card" aria-hidden="true">
          <p>Your voice. Your vision.<br />We help bring it to life.</p>
          <svg className="questions-wave" viewBox="0 0 520 72" preserveAspectRatio="none">
            <path d="M4 37c28-34 49-34 78 0s51 34 80 0 50-34 79 0 51 34 80 0 50-34 79 0 51 34 116-1" />
          </svg>
          <div className="questions-loader-track">
            <span />
            <i /><i /><i /><i /><i />
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="step-panel">
        <div className="banner banner-error" role="alert">
          <h3>Your words are safe — the questions didn’t come through</h3>
          <p>{error ?? "We couldn’t put your questions together."}</p>
          <div className="banner-actions action-row">
            <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
              Try again
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
              Back to shaping
            </button>
            {/* Only reachable after a failure — this is not a general skip. */}
            <button type="button" className="btn btn-ghost btn-sm" onClick={onContinueWithout}>
              Write lyrics without them
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return null;

  const currentAnswer = answers[currentQuestion.id] ?? "";
  const currentAnswered = currentAnswer.trim().length > 0;
  const isLastQuestion = currentIndex === questions.length - 1;
  const progress = ((currentIndex + 1) / questions.length) * 100;

  function handleBack() {
    if (currentIndex > 0) setCurrentIndex((index) => index - 1);
    else onBack();
  }

  function handleNext() {
    if (!currentAnswered) return;
    if (isLastQuestion) onContinue();
    else setCurrentIndex((index) => index + 1);
  }

  function handleSkip() {
    if (isLastQuestion) onContinue();
    else setCurrentIndex((index) => index + 1);
  }

  const starters = ["The last time we talked", "A place I remember", "Something I never said"];

  return (
    <div className="step-panel memory-question-screen">
      <section className="memory-question-hero">
        <div className="memory-question-topbar">
          <button type="button" className="memory-back" onClick={handleBack} aria-label="Go back">←</button>
          <span>Unwritten</span>
          <i aria-hidden="true" />
        </div>

        <ol className="memory-progress-dots" aria-label={`Question ${currentIndex + 1} of ${questions.length}`}>
          {questions.map((question, index) => (
            <li key={question.id} className={index === currentIndex ? "is-current" : index < currentIndex ? "is-done" : undefined} />
          ))}
        </ol>

        <div className="memory-question-copy">
          <p>MEMORY {String(currentIndex + 1).padStart(2, "0")}</p>
          <h1>{currentQuestion.question}</h1>
          <span>{currentQuestion.hint || "Begin wherever the picture becomes clear."}</span>
        </div>
      </section>

      <section className="memory-answer-sheet">
        <span className="memory-sheet-notch" style={{ left: `${Math.max(8, Math.min(92, progress))}%` }} aria-hidden="true" />
        <div className="memory-answer-heading"><span aria-hidden="true">✎</span> Answer in your own words</div>
        <label className="sr-only" htmlFor={answerId}>Your answer</label>
        <textarea
          id={answerId}
          value={currentAnswer}
          maxLength={MAX_ANSWER_LENGTH}
          rows={4}
          aria-invalid={missing.includes(currentQuestion.id) || undefined}
          aria-describedby={missing.includes(currentQuestion.id) ? errorId : undefined}
          placeholder="I remember…"
          onChange={(event) => onAnswerChange(currentQuestion.id, event.target.value)}
        />
        {missing.includes(currentQuestion.id) && <p className="memory-answer-error" id={errorId}>Add a few words before finishing your lyrics.</p>}

        <div className="memory-answer-starters" aria-label="Answer starters">
          {starters.map((starter) => (
            <button key={starter} type="button" onClick={() => onAnswerChange(currentQuestion.id, currentAnswer ? `${currentAnswer} ${starter}` : `${starter}…`)}>{starter}</button>
          ))}
        </div>
        <p className="memory-starter-hint">Tap a line to start your answer</p>

        <button type="button" className="memory-continue" disabled={!currentAnswered} onClick={handleNext}>
          {isLastQuestion ? "Continue to lyrics" : "Continue"}
        </button>
        <button type="button" className="memory-skip" onClick={handleSkip}>Skip for now — you can return later</button>
      </section>
    </div>
  );
}
