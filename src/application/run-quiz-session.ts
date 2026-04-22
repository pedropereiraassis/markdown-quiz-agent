import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { questionAnswerSchema } from '../domain/quiz/schema.js';
import type {
  QuestionAnswer,
  QuestionOption,
  QuestionType,
  Quiz,
  QuizQuestion,
  ScoredQuestionResult,
} from '../domain/quiz/types.js';
import { scoreQuiz } from '../domain/scoring/score-quiz.js';
import type { QuizGenerator } from '../infrastructure/llm/generate-quiz.js';
import { QuizGenerationError } from '../infrastructure/llm/errors.js';
import type { Logger } from '../infrastructure/logger.js';
import { createNoopLogger } from '../infrastructure/logger.js';
import type {
  MarkdownSource,
  MarkdownIngestionError,
} from '../infrastructure/markdown/fetch-markdown.js';
import { QuizSessionPersistenceError } from '../infrastructure/persistence/quiz-session-repository.js';
import type {
  PersistQuizSessionInput,
  QuizSessionRepository,
} from '../infrastructure/persistence/quiz-session-repository.js';
import { RunQuizSessionError } from './errors.js';

export interface PreparedQuizQuestion {
  id: string;
  options: QuestionOption[];
  prompt: string;
  type: QuestionType;
}

export interface PreparedQuizSession {
  normalizedSourceUrl: string;
  questions: PreparedQuizQuestion[];
  questionCount: number;
  sessionToken: string;
  sourceTitle: string | null;
  sourceUrl: string;
  wasSourceTruncated: boolean;
}

export interface CompletedQuizInput {
  answers: QuestionAnswer[];
  sessionToken: string;
}

export interface CompletedQuizQuestionResult {
  pointsAwarded: number;
  prompt: string;
  questionId: string;
  questionOrder: number;
  questionType: QuestionType;
  selectedOptionIds: string[];
  weightApplied: number;
}

export interface CompletedQuizSession {
  createdAt: string;
  finalScore: number;
  normalizedSourceUrl: string;
  questionResults: CompletedQuizQuestionResult[];
  sessionId: string;
  sourceTitle: string | null;
  sourceUrl: string;
  totalQuestionCount: number;
}

export interface RunQuizSession {
  complete(input: CompletedQuizInput): Promise<CompletedQuizSession>;
  prepare(sourceUrl: string): Promise<PreparedQuizSession>;
}

export interface CreateRunQuizSessionDependencies {
  fetchMarkdown(sourceUrl: string): Promise<MarkdownSource>;
  logger?: Logger;
  quizGenerator: Pick<QuizGenerator, 'generate'>;
  quizSessionRepository: Pick<QuizSessionRepository, 'saveSession'>;
}

const preparedSessionTokenSchema = z
  .string()
  .trim()
  .min(1, 'Prepared session token must be a non-empty string');

const preparedSessionSourceSchema = z.strictObject({
  normalizedUrl: z.string().trim().min(1),
  originalUrl: z.string().trim().min(1),
  title: z.string().trim().min(1).nullable(),
});

const publicQuizQuestionSchema = z.strictObject({
  id: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  options: z.array(
    z.strictObject({
      id: z.string().trim().min(1),
      label: z.string().trim().min(1),
    }),
  ),
  type: z.enum(['single', 'multiple']),
});

// correctOptionIds are intentionally excluded from the encoded token.
// They are stored in the closure-scoped pendingQuizzes Map and looked up
// by sessionId during complete(). This prevents correct answers from
// appearing in any serialised or logged form of PreparedQuizSession.
const preparedSessionStateSchema = z.strictObject({
  sessionId: z.string().trim().min(1),
  questions: z.array(publicQuizQuestionSchema).min(1),
  source: preparedSessionSourceSchema,
});

type PreparedQuizSessionState = z.infer<typeof preparedSessionStateSchema>;

export function createRunQuizSession(
  dependencies: CreateRunQuizSessionDependencies,
): RunQuizSession {
  const logger = dependencies.logger ?? createNoopLogger();
  const pendingQuizzes = new Map<string, Quiz>();

  return {
    async prepare(sourceUrl: string): Promise<PreparedQuizSession> {
      try {
        logger.info('source_fetch_started', { sourceUrl });
        const source = await dependencies.fetchMarkdown(sourceUrl);
        logger.info('source_fetch_completed', {
          normalizedSourceUrl: source.normalizedUrl,
          sourceUrl,
          wasTruncated: source.wasTruncated,
        });

        const quiz = await dependencies.quizGenerator.generate({ source });

        const sessionId = randomUUID();
        pendingQuizzes.set(sessionId, quiz);

        return {
          normalizedSourceUrl: source.normalizedUrl,
          questionCount: quiz.questions.length,
          questions: quiz.questions.map(toPreparedQuizQuestion),
          sessionToken: encodePreparedSessionState({
            sessionId,
            questions: quiz.questions.map(toPreparedQuizQuestion),
            source: {
              normalizedUrl: source.normalizedUrl,
              originalUrl: source.originalUrl,
              title: source.title,
            },
          }),
          sourceTitle: source.title,
          sourceUrl: source.originalUrl,
          wasSourceTruncated: source.wasTruncated,
        };
      } catch (error) {
        if (isMarkdownIngestionError(error)) {
          logger.error('source_fetch_failed', { errorType: error.code, sourceUrl });
        }
        const translated = translatePrepareError(error);
        if (!isMarkdownIngestionError(error)) {
          logger.error('prepare_failed', { errorType: translated.code, sourceUrl });
        }
        throw translated;
      }
    },

    async complete(input: CompletedQuizInput): Promise<CompletedQuizSession> {
      try {
        const preparedSessionState = decodePreparedSessionState(input.sessionToken);
        const quiz = pendingQuizzes.get(preparedSessionState.sessionId);

        if (!quiz) {
          throw new RunQuizSessionError({
            code: 'invalid_prepared_session',
            message: 'Prepared quiz session has expired or does not exist in this process',
            stage: 'complete',
          });
        }

        pendingQuizzes.delete(preparedSessionState.sessionId);

        const validatedAnswers = validateAnswers(quiz, input.answers);
        const scoredQuiz = scoreQuiz(quiz, validatedAnswers);
        const persistInput = buildPersistQuizSessionInput(
          preparedSessionState,
          quiz,
          validatedAnswers,
          scoredQuiz.questionResults,
          scoredQuiz.finalScore,
        );
        const persistedSession = await dependencies.quizSessionRepository.saveSession(persistInput);
        logger.info('session_persisted', { sessionId: persistedSession.sessionId });

        return {
          createdAt: persistedSession.createdAt,
          finalScore: scoredQuiz.finalScore,
          normalizedSourceUrl: preparedSessionState.source.normalizedUrl,
          questionResults: quiz.questions.map((question, index) => {
            const questionResult = scoredQuiz.questionResults[index];

            if (!questionResult) {
              throw new RunQuizSessionError({
                code: 'unexpected_failure',
                message: 'Scored quiz results did not match the prepared quiz questions',
                stage: 'complete',
              });
            }

            return {
              pointsAwarded: questionResult.pointsAwarded,
              prompt: question.prompt,
              questionId: question.id,
              questionOrder: questionResult.questionOrder,
              questionType: question.type,
              selectedOptionIds: [...questionResult.selectedOptionIds],
              weightApplied: questionResult.weightApplied,
            };
          }),
          sessionId: persistedSession.sessionId,
          sourceTitle: preparedSessionState.source.title,
          sourceUrl: preparedSessionState.source.originalUrl,
          totalQuestionCount: quiz.questions.length,
        };
      } catch (error) {
        if (error instanceof RunQuizSessionError) {
          logger.error('complete_failed', { errorType: error.code });
          throw error;
        }

        if (error instanceof QuizSessionPersistenceError) {
          const translated = new RunQuizSessionError({
            cause: error,
            code: 'persistence_failed',
            message: 'Could not save the completed quiz session',
            stage: 'complete',
          });
          logger.error('complete_failed', { errorType: translated.code });
          throw translated;
        }

        const translated = new RunQuizSessionError({
          cause: error,
          code: 'unexpected_failure',
          message: 'Completing the quiz session failed unexpectedly',
          stage: 'complete',
        });
        logger.error('complete_failed', { errorType: translated.code });
        throw translated;
      }
    },
  };
}

function toPreparedQuizQuestion(question: QuizQuestion): PreparedQuizQuestion {
  return {
    id: question.id,
    options: question.options.map((option) => ({
      id: option.id,
      label: option.label,
    })),
    prompt: question.prompt,
    type: question.type,
  };
}

function encodePreparedSessionState(state: PreparedQuizSessionState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

function decodePreparedSessionState(sessionToken: string): PreparedQuizSessionState {
  try {
    const parsedToken = preparedSessionTokenSchema.parse(sessionToken);
    const decodedToken = Buffer.from(parsedToken, 'base64url').toString('utf8');
    const rawState = JSON.parse(decodedToken) as unknown;

    return preparedSessionStateSchema.parse(rawState);
  } catch (error) {
    throw new RunQuizSessionError({
      cause: error,
      code: 'invalid_prepared_session',
      message: 'Prepared quiz session is invalid or could not be decoded',
      stage: 'complete',
    });
  }
}

function validateAnswers(quiz: Quiz, answers: QuestionAnswer[]): QuestionAnswer[] {
  const parsedAnswers = answers.map((answer) => {
    try {
      return questionAnswerSchema.parse(answer);
    } catch (error) {
      throw new RunQuizSessionError({
        cause: error,
        code: 'invalid_answers',
        message: 'Quiz answers must match the prepared questions and option ids',
        stage: 'complete',
      });
    }
  });

  const questionsById = new Map(quiz.questions.map((question) => [question.id, question]));

  if (parsedAnswers.length !== quiz.questions.length) {
    throw new RunQuizSessionError({
      code: 'invalid_answers',
      message: 'Quiz answers must cover every prepared question exactly once',
      stage: 'complete',
    });
  }

  const seenQuestionIds = new Set<string>();

  for (const answer of parsedAnswers) {
    if (seenQuestionIds.has(answer.questionId)) {
      throw new RunQuizSessionError({
        code: 'invalid_answers',
        message: 'Quiz answers must cover every prepared question exactly once',
        stage: 'complete',
      });
    }

    seenQuestionIds.add(answer.questionId);

    const question = questionsById.get(answer.questionId);

    if (!question) {
      throw new RunQuizSessionError({
        code: 'invalid_answers',
        message: 'Quiz answers must match the prepared questions and option ids',
        stage: 'complete',
      });
    }

    const optionIds = new Set(question.options.map((option) => option.id));

    for (const selectedOptionId of answer.selectedOptionIds) {
      if (!optionIds.has(selectedOptionId)) {
        throw new RunQuizSessionError({
          code: 'invalid_answers',
          message: 'Quiz answers must match the prepared questions and option ids',
          stage: 'complete',
        });
      }
    }
  }

  return parsedAnswers;
}

function buildPersistQuizSessionInput(
  preparedSessionState: PreparedQuizSessionState,
  quiz: Quiz,
  answers: QuestionAnswer[],
  questionResults: ScoredQuestionResult[],
  finalScore: number,
): PersistQuizSessionInput {
  const answersByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));

  return {
    answers: quiz.questions.map((question, index) => {
      const answer = answersByQuestionId.get(question.id);
      const questionResult = questionResults[index];

      if (!answer || !questionResult) {
        throw new RunQuizSessionError({
          code: 'unexpected_failure',
          message: 'Prepared quiz answers did not line up with scored results',
          stage: 'complete',
        });
      }

      return {
        correctOptionIds: [...question.correctOptionIds],
        optionSnapshot: question.options.map((option) => ({ id: option.id, label: option.label })),
        pointsAwarded: questionResult.pointsAwarded,
        questionId: question.id,
        questionOrder: questionResult.questionOrder,
        questionTextSnapshot: question.prompt,
        questionType: question.type,
        selectedOptionIds: [...answer.selectedOptionIds],
        weightApplied: questionResult.weightApplied,
      };
    }),
    finalScore,
    normalizedSourceUrl: preparedSessionState.source.normalizedUrl,
    sourceTitle: preparedSessionState.source.title,
    sourceUrl: preparedSessionState.source.originalUrl,
    totalQuestionCount: quiz.questions.length,
  };
}

function translatePrepareError(error: unknown): RunQuizSessionError {
  if (error instanceof RunQuizSessionError) {
    return error;
  }

  if (isMarkdownIngestionError(error)) {
    if (error.code === 'invalid_url' || error.code === 'unsupported_scheme') {
      return new RunQuizSessionError({
        cause: error,
        code: 'invalid_source_url',
        message: 'Source URL must be a valid absolute http:// or https:// URL',
        stage: 'prepare',
      });
    }

    return new RunQuizSessionError({
      cause: error,
      code: 'source_unavailable',
      message: 'Could not load bounded Markdown from the source URL',
      stage: 'prepare',
    });
  }

  if (error instanceof QuizGenerationError) {
    return new RunQuizSessionError({
      cause: error,
      code: 'quiz_generation_failed',
      message: 'Could not generate a valid quiz from the bounded source Markdown',
      stage: 'prepare',
    });
  }

  return new RunQuizSessionError({
    cause: error,
    code: 'unexpected_failure',
    message: 'Preparing the quiz session failed unexpectedly',
    stage: 'prepare',
  });
}

function isMarkdownIngestionError(error: unknown): error is MarkdownIngestionError {
  return (
    error instanceof Error &&
    error.name === 'MarkdownIngestionError' &&
    'code' in error &&
    typeof error.code === 'string'
  );
}
