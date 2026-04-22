import type {
  CompletedQuizSession,
  PreparedQuizSession,
} from '../../application/run-quiz-session.js';
import { roundScoreForDisplay } from '../../domain/scoring/score-quiz.js';

const DISPLAY_SCORE_FRACTION_DIGITS = 2;

function formatScore(score: number): string {
  return roundScoreForDisplay(score, DISPLAY_SCORE_FRACTION_DIGITS).toFixed(
    DISPLAY_SCORE_FRACTION_DIGITS,
  );
}

export function renderPreparedSourceSummary(
  preparedSession: Pick<PreparedQuizSession, 'sourceTitle' | 'wasSourceTruncated'>,
): string[] {
  const lines: string[] = [];

  if (preparedSession.sourceTitle) {
    lines.push(`Source: ${preparedSession.sourceTitle}`);
  }

  if (preparedSession.wasSourceTruncated) {
    lines.push('The source was trimmed to fit the quiz context.');
  }

  return lines;
}

export function renderResults(completedSession: CompletedQuizSession): string[] {
  const questionLines = completedSession.questionResults.map(
    (questionResult) =>
      `Question ${questionResult.questionOrder}: ${formatScore(questionResult.pointsAwarded)} points`,
  );

  return [
    'Results',
    ...questionLines,
    `Final score: ${formatScore(completedSession.finalScore)} / 4.00`,
    'Scoring notes: Multiple-answer questions can earn partial credit, and wrong extra selections reduce that credit.',
    'Scoring notes: Later questions count slightly more in the final score.',
  ];
}

export function formatSaveConfirmation(sessionId: string): string {
  return `Session saved as ${sessionId}.`;
}
