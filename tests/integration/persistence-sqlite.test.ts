import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createPersistenceKnex,
  destroyPersistenceKnex,
  migrateToLatest,
} from '../../src/infrastructure/persistence/knex.js';
import {
  KnexQuizSessionRepository,
  type PersistQuizSessionInput,
} from '../../src/infrastructure/persistence/quiz-session-repository.js';
import {
  createMultipleQuestion,
  createSingleQuestion,
} from '../support/quiz-fixtures.js';

function createPersistQuizSessionInput(): PersistQuizSessionInput {
  const singleQuestion = createSingleQuestion('q1');
  const multipleQuestion = createMultipleQuestion('q2', ['q2-a', 'q2-b', 'q2-d']);

  return {
    sourceUrl: 'https://example.com/guide.md',
    normalizedSourceUrl: 'https://example.com/guide.md',
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
        weightApplied: 1.2100000000000002,
      },
    ],
  };
}

describe('SQLite persistence integration', () => {
  let database: Knex | undefined;
  let databaseDirectory: string | undefined;

  beforeEach(async () => {
    databaseDirectory = await mkdtemp(path.join(tmpdir(), 'markdown-quiz-agent-'));
    database = await createPersistenceKnex(path.join(databaseDirectory, 'quiz.sqlite'));
    await migrateToLatest(database);
  });

  afterEach(async () => {
    if (database) {
      await destroyPersistenceKnex(database);
    }

    if (databaseDirectory) {
      await rm(databaseDirectory, { recursive: true, force: true });
    }
  });

  it('creates the quiz_sessions and quiz_answers tables with the expected columns', async () => {
    const databaseConnection = database;

    expect(databaseConnection).toBeDefined();

    if (!databaseConnection) {
      throw new Error('Expected SQLite database to be initialized for the test');
    }

    const sessionColumns = await databaseConnection('quiz_sessions').columnInfo();
    const answerColumns = await databaseConnection('quiz_answers').columnInfo();

    expect(Object.keys(sessionColumns).sort()).toEqual([
      'created_at',
      'final_score',
      'id',
      'normalized_source_url',
      'source_title',
      'source_url',
      'total_question_count',
    ]);
    expect(Object.keys(answerColumns).sort()).toEqual([
      'correct_option_ids_json',
      'id',
      'option_snapshot_json',
      'points_awarded',
      'question_id',
      'question_order',
      'question_text_snapshot',
      'question_type',
      'selected_option_ids_json',
      'session_id',
      'weight_applied',
    ]);
  });

  it('persists a full session and linked answer snapshots in question order without rounding numeric values', async () => {
    const databaseConnection = database;

    expect(databaseConnection).toBeDefined();

    if (!databaseConnection) {
      throw new Error('Expected SQLite database to be initialized for the test');
    }

    const input = createPersistQuizSessionInput();
    const repository = new KnexQuizSessionRepository(databaseConnection);

    const savedSession = await repository.saveSession(input);
    const sessionRow = await databaseConnection<{
      id: string;
      source_url: string;
      normalized_source_url: string;
      source_title: string | null;
      total_question_count: number;
      final_score: number;
      created_at: string;
    }>('quiz_sessions')
      .where({ id: savedSession.sessionId })
      .first();
    const answerRows = await databaseConnection<{
      id: string;
      session_id: string;
      question_id: string;
      question_order: number;
      question_type: string;
      question_text_snapshot: string;
      option_snapshot_json: string;
      correct_option_ids_json: string;
      selected_option_ids_json: string;
      points_awarded: number;
      weight_applied: number;
    }>('quiz_answers')
      .where({ session_id: savedSession.sessionId })
      .orderBy('question_order', 'asc');

    expect(sessionRow).toEqual({
      id: savedSession.sessionId,
      source_url: input.sourceUrl,
      normalized_source_url: input.normalizedSourceUrl,
      source_title: input.sourceTitle,
      total_question_count: input.totalQuestionCount,
      final_score: input.finalScore,
      created_at: savedSession.createdAt,
    });

    expect(answerRows).toHaveLength(2);
    expect(answerRows.map((row) => row.session_id)).toEqual([
      savedSession.sessionId,
      savedSession.sessionId,
    ]);
    expect(answerRows.map((row) => row.question_order)).toEqual([1, 2]);
    expect(answerRows.map((row) => row.question_id)).toEqual(['q1', 'q2']);
    expect(answerRows[0]?.points_awarded).toBe(4);
    expect(answerRows[1]?.points_awarded).toBe(8 / 3);
    expect(answerRows[1]?.weight_applied).toBe(1.2100000000000002);
    expect(answerRows[1]?.question_text_snapshot).toBe('Prompt for q2');
    expect(JSON.parse(answerRows[1]!.option_snapshot_json)).toEqual(input.answers[1]?.optionSnapshot);
    expect(JSON.parse(answerRows[1]!.correct_option_ids_json)).toEqual(
      input.answers[1]?.correctOptionIds,
    );
    expect(JSON.parse(answerRows[1]!.selected_option_ids_json)).toEqual(
      input.answers[1]?.selectedOptionIds,
    );
  });
});
