import type {
  SavedQuizAnswer,
  SavedQuizSession,
  SavedQuizSessionSummary,
} from "../../application/read-last-session.js";
import { roundScoreForDisplay } from "../../domain/scoring/score-quiz.js";

export function renderLastSession(session: SavedQuizSession): string[] {
  const lines: string[] = [];

  lines.push(`Session id: ${session.sessionId}`);
  lines.push(`Saved at:   ${session.createdAt}`);
  lines.push(
    `Source:     ${session.sourceTitle ?? session.normalizedSourceUrl}`,
  );
  lines.push(`URL:        ${session.sourceUrl}`);
  lines.push(
    `Final score: ${roundScoreForDisplay(session.finalScore)} / 4.00 ` +
      `(${session.totalQuestionCount} questions)`,
  );
  lines.push("");

  for (const answer of session.answers) {
    lines.push(formatAnswer(answer));
  }

  return lines;
}

export function renderNoSavedSessions(): string {
  return "No quiz sessions have been saved yet. Run `npm run cli` first.";
}

export function renderSavedSessionList(
  sessions: SavedQuizSessionSummary[],
): string[] {
  return sessions.map(
    (session, index) =>
      `${index + 1}. ${session.createdAt} | ${roundScoreForDisplay(session.finalScore)} / 4.00 | ` +
      `${session.totalQuestionCount} questions | ${session.sourceTitle ?? session.normalizedSourceUrl} | ` +
      `${session.sessionId}`,
  );
}

function formatAnswer(answer: SavedQuizAnswer): string {
  const optionLabelById = new Map(
    answer.options.map((option) => [option.id, option.label]),
  );
  const correct = answer.correctOptionIds
    .map((id) => optionLabelById.get(id) ?? id)
    .join(" | ");
  const selected = answer.selectedOptionIds.length
    ? answer.selectedOptionIds
        .map((id) => optionLabelById.get(id) ?? id)
        .join(" | ")
    : "(no answer)";
  const typeLabel = answer.questionType === "single" ? "single" : "multiple";

  return [
    `Q${answer.questionOrder} [${typeLabel}] ${answer.questionText}`,
    `  correct:  ${correct}`,
    `  selected: ${selected}`,
    `  points:   ${roundScoreForDisplay(answer.pointsAwarded)} / 4.00 ` +
      `(weight ${roundScoreForDisplay(answer.weightApplied, 4)})`,
    "",
  ].join("\n");
}
