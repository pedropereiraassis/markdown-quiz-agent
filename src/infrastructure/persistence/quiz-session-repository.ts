import { randomUUID } from "node:crypto";

import type { Knex } from "knex";

import type { QuestionOption, QuestionType } from "../../domain/quiz/types.js";
import {
  serializeOptionIdSnapshot,
  serializeOptionSnapshot,
} from "./serialize-snapshots.js";

export interface PersistedQuizAnswerInput {
  questionId: string;
  questionOrder: number;
  questionType: QuestionType;
  questionTextSnapshot: string;
  optionSnapshot: QuestionOption[];
  correctOptionIds: string[];
  selectedOptionIds: string[];
  pointsAwarded: number;
  weightApplied: number;
}

export interface PersistQuizSessionInput {
  sourceUrl: string;
  normalizedSourceUrl: string;
  sourceTitle: string | null;
  totalQuestionCount: number;
  finalScore: number;
  answers: PersistedQuizAnswerInput[];
}

export interface PersistQuizSessionResult {
  sessionId: string;
  createdAt: string;
}

export interface QuizSessionRow {
  id: string;
  source_url: string;
  normalized_source_url: string;
  source_title: string | null;
  total_question_count: number;
  final_score: number;
  created_at: string;
}

export interface QuizAnswerRow {
  id: string;
  session_id: string;
  question_id: string;
  question_order: number;
  question_type: QuestionType;
  question_text_snapshot: string;
  option_snapshot_json: string;
  correct_option_ids_json: string;
  selected_option_ids_json: string;
  points_awarded: number;
  weight_applied: number;
}

export interface QuizSessionRepository {
  saveSession(
    session: PersistQuizSessionInput,
  ): Promise<PersistQuizSessionResult>;
}

export class QuizSessionPersistenceError extends Error {
  override readonly name = "QuizSessionPersistenceError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export function buildQuizSessionInsertRow(
  session: PersistQuizSessionInput,
  sessionId: string,
  createdAt: string,
): QuizSessionRow {
  return {
    id: sessionId,
    source_url: session.sourceUrl,
    normalized_source_url: session.normalizedSourceUrl,
    source_title: session.sourceTitle,
    total_question_count: session.totalQuestionCount,
    final_score: session.finalScore,
    created_at: createdAt,
  };
}

export function buildQuizAnswerInsertRows(
  session: PersistQuizSessionInput,
  sessionId: string,
): QuizAnswerRow[] {
  return session.answers.map((answer) => ({
    id: randomUUID(),
    session_id: sessionId,
    question_id: answer.questionId,
    question_order: answer.questionOrder,
    question_type: answer.questionType,
    question_text_snapshot: answer.questionTextSnapshot,
    option_snapshot_json: serializeOptionSnapshot(answer.optionSnapshot),
    correct_option_ids_json: serializeOptionIdSnapshot(answer.correctOptionIds),
    selected_option_ids_json: serializeOptionIdSnapshot(
      answer.selectedOptionIds,
    ),
    points_awarded: answer.pointsAwarded,
    weight_applied: answer.weightApplied,
  }));
}

export class KnexQuizSessionRepository implements QuizSessionRepository {
  constructor(private readonly database: Pick<Knex, "transaction">) {}

  async saveSession(
    session: PersistQuizSessionInput,
  ): Promise<PersistQuizSessionResult> {
    const sessionId = randomUUID();
    const createdAt = new Date().toISOString();
    const sessionRow = buildQuizSessionInsertRow(session, sessionId, createdAt);
    const answerRows = buildQuizAnswerInsertRows(session, sessionId);

    try {
      await this.database.transaction(async (transaction) => {
        await transaction<QuizSessionRow>("quiz_sessions").insert(sessionRow);

        if (answerRows.length > 0) {
          await transaction<QuizAnswerRow>("quiz_answers").insert(answerRows);
        }
      });
    } catch (error) {
      throw new QuizSessionPersistenceError("Failed to persist quiz session", {
        cause: error instanceof Error ? error : undefined,
      });
    }

    return {
      sessionId,
      createdAt,
    };
  }
}
