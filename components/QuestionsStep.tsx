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

function QuestionField(props: {
  index: number;
  question: SongQuestion;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const { index, question, value, invalid, onChange } = props;
  return (
    <div className="field question-field question-focus-field">
      <div className="question-focus-prompt">
        <span className="question-number" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div>
          <label className="field-label" htmlFor={id}>{question.question}</label>
          <p className="field-hint">{question.hint || "One or two sentences is plenty."}</p>
        </div>
      </div>
      <textarea
        id={id}
        className={`question-answer${invalid ? " invalid" : ""}`}
        value={value}
        maxLength={MAX_ANSWER_LENGTH}
        rows={5}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        placeholder="Write what you remember…"
        onChange={(e) => onChange(e.target.value)}
      />
      {invalid && (
        <p className="field-error" id={errorId}>
          This one’s still blank.
        </p>
      )}
    </div>
  );
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

  const starters = ["I remember…", "It felt like…", "The detail that stands out…"];

  return (
    <div className="step-panel questions-focus">
      <div className="questions-focus-heading">
        <h1>Bring the memory<br />into focus</h1>
        <span className="questions-heading-flourish" aria-hidden="true">✦</span>
        <p>Small details make the lyrics feel like yours.</p>
      </div>

      <div className="questions-focus-progress" aria-live="polite">
        <p>Question {currentIndex + 1} of {questions.length}</p>
        <div className="questions-progress-track" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="question-focus-card">
        <QuestionField
          key={currentQuestion.id}
          index={currentIndex}
          question={currentQuestion}
          value={currentAnswer}
          invalid={missing.includes(currentQuestion.id)}
          onChange={(value) => onAnswerChange(currentQuestion.id, value)}
        />
        <div className="question-starters" aria-label="Answer starters">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => onAnswerChange(currentQuestion.id, currentAnswer ? `${currentAnswer} ${starter}` : starter)}
            >
              {starter}
            </button>
          ))}
        </div>
      </div>

      <div className="flow-nav questions-focus-nav">
        <button type="button" className="btn btn-secondary" onClick={handleBack}>
          ← Back
        </button>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={!currentAnswered}
          onClick={handleNext}
        >
          {isLastQuestion ? "Write my lyrics" : "Next question"} →
        </button>
      </div>

      <p className="questions-saved"><span aria-hidden="true">✓</span> Saved on this device</p>
    </div>
  );
}
