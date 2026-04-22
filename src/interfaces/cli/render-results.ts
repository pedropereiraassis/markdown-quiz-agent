import type {
  CompletedQuizSession,
  PreparedQuizSession,
} from "../../application/run-quiz-session.js";
import { roundScoreForDisplay } from "../../domain/scoring/score-quiz.js";

const DISPLAY_SCORE_FRACTION_DIGITS = 2;

function formatScore(score: number): string {
  return roundScoreForDisplay(score, DISPLAY_SCORE_FRACTION_DIGITS).toFixed(
    DISPLAY_SCORE_FRACTION_DIGITS,
  );
}

export function renderPreparedSourceSummary(
  preparedSession: Pick<
    PreparedQuizSession,
    "sourceTitle" | "wasSourceTruncated"
  >,
): string[] {
  const lines: string[] = [];

  if (preparedSession.sourceTitle) {
    lines.push(`Source: ${preparedSession.sourceTitle}`);
  }

  if (preparedSession.wasSourceTruncated) {
    lines.push("The source was trimmed to fit the quiz context.");
  }

  return lines;
}

export function renderResults(
  completedSession: CompletedQuizSession,
): string[] {
  const questionLines = completedSession.questionResults.flatMap(
    (questionResult) => [
      `Question ${questionResult.questionOrder}: ${formatScore(questionResult.pointsAwarded)} points`,
      `  Selected: ${formatOptionLabels(questionResult.options, questionResult.selectedOptionIds, "(no answer)")}`,
      `  Correct: ${formatOptionLabels(questionResult.options, questionResult.correctOptionIds)}`,
    ],
  );

  return [
    "Results",
    ...questionLines,
    `Final score: ${formatScore(completedSession.finalScore)} / 4.00`,
    "Scoring notes: Multiple-answer questions can earn partial credit based on how many correct options you selected.",
    "Scoring notes: Later questions count slightly more in the final score.",
  ];
}

export function formatSaveConfirmation(sessionId: string): string {
  return `Session saved as ${sessionId}.`;
}

function formatOptionLabels(
  options: CompletedQuizSession["questionResults"][number]["options"],
  optionIds: string[],
  fallback = "(unknown)",
): string {
  if (optionIds.length === 0) {
    return fallback;
  }

  const optionLabelById = new Map(
    options.map((option) => [option.id, option.label]),
  );

  return optionIds
    .map((optionId) => optionLabelById.get(optionId) ?? optionId)
    .join(" | ");
}
