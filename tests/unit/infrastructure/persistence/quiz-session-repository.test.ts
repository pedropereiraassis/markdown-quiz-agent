import type { Knex } from 'knex';
import { describe, expect, it, vi } from 'vitest';

import {
  KnexQuizSessionRepository,
  QuizSessionPersistenceError,
  type PersistQuizSessionInput,
} from '../../../../src/infrastructure/persistence/quiz-session-repository.js';
import {
  serializeOptionIdSnapshot,
  serializeOptionSnapshot,
} from '../../../../src/infrastructure/persistence/serialize-snapshots.js';
import {
  createMultipleQuestion,
  createSingleQuestion,
} from '../../../support/quiz-fixtures.js';

interface InsertCall {
  tableName: string;
  payload: unknown;
}

function createPersistQuizSessionInput(): PersistQuizSessionInput {
  const singleQuestion = createSingleQuestion('q1');
  const multipleQuestion = createMultipleQuestion('q2', ['q2-a', 'q2-b', 'q2-d']);

  return {
    sourceUrl: 'https://github.com/acme/docs/blob/main/guide.md?plain=1#intro',
    normalizedSourceUrl: 'https://raw.githubusercontent.com/acme/docs/main/guide.md',
    sourceTitle: 'Guide',
    totalQuestionCount: 2,
    finalScore: 2.612345678901234,
    answers: [
      {
        questionId: singleQuestion.id,
        questionOrder: 1,
        questionType: singleQuestion.type,
        questionTextSnapshot: singleQuestion.prompt,
        optionSnapshot: singleQuestion.options,
        correctOptionIds: singleQuestion.correctOptionIds,
        selectedOptionIds: ['q1-a'],
        pointsAwarded: 4,
        weightApplied: 1,
      },
      {
        questionId: multipleQuestion.id,
        questionOrder: 2,
        questionType: multipleQuestion.type,
        questionTextSnapshot: multipleQuestion.prompt,
        optionSnapshot: multipleQuestion.options,
        correctOptionIds: multipleQuestion.correctOptionIds,
        selectedOptionIds: ['q2-a', 'q2-d'],
        pointsAwarded: 8 / 3,
        weightApplied: 1.1,
      },
    ],
  };
}

function createFakeDatabase(options: { failOnTable?: string; error?: Error } = {}) {
  const insertCalls: InsertCall[] = [];

  const transaction = vi.fn(async (handler: (transaction: Knex.Transaction) => Promise<unknown>) => {
    const fakeTransaction = ((tableName: string) => ({
      insert: async (payload: unknown) => {
        if (options.failOnTable === tableName) {
          throw options.error ?? new Error(`Failed to insert into ${tableName}`);
        }

        insertCalls.push({ tableName, payload });
      },
    })) as unknown as Knex.Transaction;

    return handler(fakeTransaction);
  });

  return {
    database: { transaction } as unknown as Pick<Knex, 'transaction'>,
    insertCalls,
    transaction,
  };
}

describe('serialize snapshots', () => {
  it('serializes option snapshots and option id lists as stable JSON', () => {
    const question = createMultipleQuestion('q2', ['q2-a', 'q2-b']);

    expect(serializeOptionSnapshot(question.options)).toBe(
      '[{"id":"q2-a","label":"Option A for q2"},{"id":"q2-b","label":"Option B for q2"},{"id":"q2-c","label":"Option C for q2"},{"id":"q2-d","label":"Option D for q2"}]',
    );
    expect(serializeOptionIdSnapshot(question.correctOptionIds)).toBe('["q2-a","q2-b"]');
    expect(serializeOptionIdSnapshot(['q2-b', 'q2-a'])).toBe('["q2-b","q2-a"]');
  });
});

describe('KnexQuizSessionRepository', () => {
  it('maps session and answer payloads to the expected persisted columns without rounding', async () => {
    const input = createPersistQuizSessionInput();
    const { database, insertCalls, transaction } = createFakeDatabase();
    const repository = new KnexQuizSessionRepository(database);

    const savedSession = await repository.saveSession(input);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(insertCalls).toHaveLength(2);

    const sessionInsert = insertCalls[0];
    const answerInsert = insertCalls[1];

    expect(sessionInsert).toBeDefined();
    expect(sessionInsert?.tableName).toBe('quiz_sessions');
    expect(sessionInsert?.payload).toEqual({
      id: savedSession.sessionId,
      source_url: input.sourceUrl,
      normalized_source_url: input.normalizedSourceUrl,
      source_title: input.sourceTitle,
      total_question_count: input.totalQuestionCount,
      final_score: input.finalScore,
      created_at: savedSession.createdAt,
    });

    expect(answerInsert?.tableName).toBe('quiz_answers');
    expect(answerInsert?.payload).toEqual([
      {
        id: expect.any(String),
        session_id: savedSession.sessionId,
        question_id: 'q1',
        question_order: 1,
        question_type: 'single',
        question_text_snapshot: 'Prompt for q1',
        option_snapshot_json:
          '[{"id":"q1-a","label":"Option A for q1"},{"id":"q1-b","label":"Option B for q1"},{"id":"q1-c","label":"Option C for q1"},{"id":"q1-d","label":"Option D for q1"}]',
        correct_option_ids_json: '["q1-a"]',
        selected_option_ids_json: '["q1-a"]',
        points_awarded: 4,
        weight_applied: 1,
      },
      {
        id: expect.any(String),
        session_id: savedSession.sessionId,
        question_id: 'q2',
        question_order: 2,
        question_type: 'multiple',
        question_text_snapshot: 'Prompt for q2',
        option_snapshot_json:
          '[{"id":"q2-a","label":"Option A for q2"},{"id":"q2-b","label":"Option B for q2"},{"id":"q2-c","label":"Option C for q2"},{"id":"q2-d","label":"Option D for q2"}]',
        correct_option_ids_json: '["q2-a","q2-b","q2-d"]',
        selected_option_ids_json: '["q2-a","q2-d"]',
        points_awarded: 8 / 3,
        weight_applied: 1.1,
      },
    ]);
  });

  it('translates write failures into a typed persistence error', async () => {
    const input = createPersistQuizSessionInput();
    const databaseFailure = new Error('disk full');
    const { database } = createFakeDatabase({
      failOnTable: 'quiz_answers',
      error: databaseFailure,
    });
    const repository = new KnexQuizSessionRepository(database);

    try {
      await repository.saveSession(input);
      throw new Error('Expected saveSession to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(QuizSessionPersistenceError);
      expect(error).toMatchObject({
        message: 'Failed to persist quiz session',
        cause: databaseFailure,
      });
    }
  });
});
