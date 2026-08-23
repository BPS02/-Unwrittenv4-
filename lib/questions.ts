import type { QuestionAnswer, SongQuestion } from "./types";

/**
 * The "answer every question" rule, kept out of the component so it can be
 * tested and can't drift.
 *
 * The empty-question case is the important one: a draft restored onto the
 * questions step before its questions arrived (a reload, or the sign-in
 * round-trip) has nothing to answer, and a naive "no blanks found" check
 * passes vacuously — writing the lyrics with no answers at all, which is
 * exactly what the step exists to prevent.
 */

/** Ids of questions with no non-whitespace answer, in order. */
export function unansweredQuestionIds(
  questions: SongQuestion[],
  answers: Record<string, string>
): string[] {
  return questions
    .filter((q) => (answers[q.id] ?? "").trim().length === 0)
    .map((q) => q.id);
}

/** True only when there is at least one question and all are answered. */
export function answersComplete(
  questions: SongQuestion[],
  answers: Record<string, string>
): boolean {
  if (questions.length === 0) return false;
  return unansweredQuestionIds(questions, answers).length === 0;
}

/** Pairs each question with its trimmed answer for the lyrics prompt. */
export function collectAnswers(
  questions: SongQuestion[],
  answers: Record<string, string>
): QuestionAnswer[] {
  return questions.map((q) => ({
    id: q.id,
    question: q.question,
    answer: (answers[q.id] ?? "").trim(),
  }));
}
