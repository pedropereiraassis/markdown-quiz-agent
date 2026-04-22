import type { Knex } from "knex";

import type { QuestionOption, QuestionType } from "../domain/quiz/types.js";
import type {
  QuizAnswerRow,
  QuizSessionRow,
} from "../infrastructure/persistence/quiz-session-repository.js";

export interface SavedQuizAnswer {
  questionId: string;
  questionOrder: number;
  questionType: QuestionType;
  questionText: string;
  options: QuestionOption[];
  correctOptionIds: string[];
  selectedOptionIds: string[];
  pointsAwarded: number;
  weightApplied: number;
}

export interface SavedQuizSession {
  sessionId: string;
  sourceUrl: string;
  normalizedSourceUrl: string;
  sourceTitle: string | null;
  totalQuestionCount: number;
  finalScore: number;
  createdAt: string;
  answers: SavedQuizAnswer[];
}

export interface SavedQuizSessionSummary {
  createdAt: string;
  finalScore: number;
  normalizedSourceUrl: string;
  sessionId: string;
  sourceTitle: string | null;
  totalQuestionCount: number;
}

export async function readLastSession(
  database: Pick<Knex, "table"> & Knex,
): Promise<SavedQuizSession | null> {
  const sessionRow = await database<QuizSessionRow>("quiz_sessions")
    .orderBy("created_at", "desc")
    .first();

  if (!sessionRow) {
    return null;
  }

  const answerRows = await database<QuizAnswerRow>("quiz_answers")
    .where({ session_id: sessionRow.id })
    .orderBy("question_order", "asc");

  return {
    sessionId: sessionRow.id,
    sourceUrl: sessionRow.source_url,
    normalizedSourceUrl: sessionRow.normalized_source_url,
    sourceTitle: sessionRow.source_title,
    totalQuestionCount: sessionRow.total_question_count,
    finalScore: sessionRow.final_score,
    createdAt: sessionRow.created_at,
    answers: answerRows.map((row) => ({
      questionId: row.question_id,
      questionOrder: row.question_order,
      questionType: row.question_type,
      questionText: row.question_text_snapshot,
      options: parseOptionSnapshot(row.option_snapshot_json),
      correctOptionIds: parseIdSnapshot(row.correct_option_ids_json),
      selectedOptionIds: parseIdSnapshot(row.selected_option_ids_json),
      pointsAwarded: row.points_awarded,
      weightApplied: row.weight_applied,
    })),
  };
}

export async function listSavedSessions(
  database: Pick<Knex, "table"> & Knex,
  limit = 10,
): Promise<SavedQuizSessionSummary[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Session list limit must be a positive integer");
  }

  const sessionRows = await database<QuizSessionRow>("quiz_sessions")
    .orderBy("created_at", "desc")
    .limit(limit);

  return sessionRows.map((row) => ({
    createdAt: row.created_at,
    finalScore: row.final_score,
    normalizedSourceUrl: row.normalized_source_url,
    sessionId: row.id,
    sourceTitle: row.source_title,
    totalQuestionCount: row.total_question_count,
  }));
}

function parseOptionSnapshot(json: string): QuestionOption[] {
  const parsed = JSON.parse(json) as Array<{ id: string; label: string }>;
  return parsed.map((option) => ({ id: option.id, label: option.label }));
}

function parseIdSnapshot(json: string): string[] {
  return JSON.parse(json) as string[];
}
