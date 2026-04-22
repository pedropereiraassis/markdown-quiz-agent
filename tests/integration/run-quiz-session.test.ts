import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRunQuizSession,
  RunQuizSessionError,
} from '../../src/application/index.js';
import { getQuestionWeights, scoreQuiz } from '../../src/domain/scoring/score-quiz.js';
import { QuizGenerationValidationError } from '../../src/infrastructure/llm/errors.js';
import { MarkdownIngestionError } from '../../src/infrastructure/markdown/fetch-markdown.js';
import {
  createPersistenceKnex,
  destroyPersistenceKnex,
  migrateToLatest,
} from '../../src/infrastructure/persistence/knex.js';
import { KnexQuizSessionRepository } from '../../src/infrastructure/persistence/quiz-session-repository.js';
import {
  createAnswers,
  createMultipleQuestion,
  createQuiz,
  createSingleQuestion,
} from '../support/quiz-fixtures.js';

describe('run quiz session integration', () => {
  let database: Knex | undefined;
  let databaseDirectory: string | undefined;

  beforeEach(async () => {
    databaseDirectory = await mkdtemp(path.join(tmpdir(), 'markdown-quiz-agent-run-session-'));
    database = await createPersistenceKnex(path.join(databaseDirectory, 'quiz.sqlite'));
    await migrateToLatest(database);
  });

  afterEach(async () => {
    if (database) {
      await destroyPersistenceKnex(database);
    }

    if (databaseDirectory) {
      await rm(databaseDirectory, { force: true, recursive: true });
    }
  });

  it('persists one completed session and ordered answer snapshots through the application use case', async () => {
    const databaseConnection = database;

    expect(databaseConnection).toBeDefined();

    if (!databaseConnection) {
      throw new Error('Expected SQLite database to be initialized for the test');
    }

    const source = {
      chunkCount: 3,
      markdown: '# Guide\n\nA bounded guide.',
      normalizedUrl: 'https://raw.githubusercontent.com/acme/docs/main/guide.md',
      originalCharacters: 320,
      originalUrl: 'https://github.com/acme/docs/blob/main/guide.md',
      retainedCharacters: 320,
      title: 'Guide',
      wasTruncated: false,
    };
    const quiz = createQuiz([
      createSingleQuestion('q1', 'q1-a'),
      createMultipleQuestion('q2', ['q2-a', 'q2-b']),
      createSingleQuestion('q3', 'q3-b'),
      createMultipleQuestion('q4', ['q4-a', 'q4-c', 'q4-d']),
      createSingleQuestion('q5', 'q5-d'),
    ]);
    const answers = createAnswers({
      q1: ['q1-a'],
      q2: ['q2-a'],
      q3: ['q3-b'],
      q4: ['q4-a', 'q4-c'],
      q5: ['q5-d'],
    });
    const expectedScore = scoreQuiz(quiz, answers);
    const repository = new KnexQuizSessionRepository(databaseConnection);
    const runQuizSession = createRunQuizSession({
      fetchMarkdown: vi.fn().mockResolvedValue(source),
      quizGenerator: { generate: vi.fn().mockResolvedValue(quiz) },
      quizSessionRepository: repository,
    });

    const prepared = await runQuizSession.prepare(source.originalUrl);
    const completed = await runQuizSession.complete({
      answers,
      sessionToken: prepared.sessionToken,
    });
    const sessionRow = await databaseConnection<{
      created_at: string;
      final_score: number;
      id: string;
      normalized_source_url: string;
      source_title: string | null;
      source_url: string;
      total_question_count: number;
    }>('quiz_sessions').first();
    const answerRows = await databaseConnection<{
      correct_option_ids_json: string;
      points_awarded: number;
      question_id: string;
      question_order: number;
      question_text_snapshot: string;
      selected_option_ids_json: string;
      session_id: string;
      weight_applied: number;
    }>('quiz_answers')
      .orderBy('question_order', 'asc');

    expect(completed.finalScore).toBe(expectedScore.finalScore);
    expect(completed.questionResults.map((result) => result.questionOrder)).toEqual([1, 2, 3, 4, 5]);
    expect(completed.questionResults.map((result) => result.weightApplied)).toEqual(
      getQuestionWeights(quiz.questions.length),
    );
    expect(sessionRow).toEqual({
      created_at: completed.createdAt,
      final_score: expectedScore.finalScore,
      id: completed.sessionId,
      normalized_source_url: source.normalizedUrl,
      source_title: source.title,
      source_url: source.originalUrl,
      total_question_count: quiz.questions.length,
    });
    expect(answerRows).toHaveLength(quiz.questions.length);
    expect(answerRows.map((row) => row.session_id)).toEqual(
      Array.from({ length: quiz.questions.length }, () => completed.sessionId),
    );
    expect(answerRows.map((row) => row.question_order)).toEqual([1, 2, 3, 4, 5]);
    expect(answerRows.map((row) => row.question_id)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
    expect(answerRows.map((row) => row.weight_applied)).toEqual(getQuestionWeights(5));
    expect(answerRows[1]?.points_awarded).toBe(2);
    expect(answerRows[3]?.points_awarded).toBe(8 / 3);
    expect(answerRows[3]?.question_text_snapshot).toBe('Prompt for q4');
    expect(JSON.parse(answerRows[3]!.correct_option_ids_json)).toEqual(['q4-a', 'q4-c', 'q4-d']);
    expect(JSON.parse(answerRows[3]!.selected_option_ids_json)).toEqual(['q4-a', 'q4-c']);
  });

  it.each([
    [
      'fetch failure',
      {
        fetchMarkdown: vi.fn().mockRejectedValue(
          new MarkdownIngestionError({
            code: 'timeout',
            message: 'Source request exceeded the timeout',
            url: 'https://github.com/acme/docs/blob/main/guide.md',
          }),
        ),
        quizGenerator: { generate: vi.fn() },
      },
    ],
    [
      'generation failure',
      {
        fetchMarkdown: vi.fn().mockResolvedValue({
          chunkCount: 1,
          markdown: '# Guide',
          normalizedUrl: 'https://raw.githubusercontent.com/acme/docs/main/guide.md',
          originalCharacters: 7,
          originalUrl: 'https://github.com/acme/docs/blob/main/guide.md',
          retainedCharacters: 7,
          title: 'Guide',
          wasTruncated: false,
        }),
        quizGenerator: {
          generate: vi
            .fn()
            .mockRejectedValue(
              new QuizGenerationValidationError('Schema validation failed', 2, ['questions']),
            ),
        },
      },
    ],
  ])('stops before any persistence on %s', async (_label, failureCase) => {
    const databaseConnection = database;

    expect(databaseConnection).toBeDefined();

    if (!databaseConnection) {
      throw new Error('Expected SQLite database to be initialized for the test');
    }

    const repository = new KnexQuizSessionRepository(databaseConnection);
    const runQuizSession = createRunQuizSession({
      fetchMarkdown: failureCase.fetchMarkdown,
      quizGenerator: failureCase.quizGenerator,
      quizSessionRepository: repository,
    });

    await expect(
      runQuizSession.prepare('https://github.com/acme/docs/blob/main/guide.md'),
    ).rejects.toBeInstanceOf(RunQuizSessionError);

    const sessionCountRow = await databaseConnection<{ count: number }>('quiz_sessions')
      .count<{ count: number }>({ count: '*' })
      .first();
    const answerCountRow = await databaseConnection<{ count: number }>('quiz_answers')
      .count<{ count: number }>({ count: '*' })
      .first();

    expect(Number(sessionCountRow?.count ?? 0)).toBe(0);
    expect(Number(answerCountRow?.count ?? 0)).toBe(0);
  });
});
