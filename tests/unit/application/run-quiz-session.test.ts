import { describe, expect, it, vi } from "vitest";

import {
  createRunQuizSession,
  RunQuizSessionError,
} from "../../../src/application/index.js";
import { scoreQuiz } from "../../../src/domain/scoring/score-quiz.js";
import { QuizGenerationValidationError } from "../../../src/infrastructure/llm/errors.js";
import type { Logger } from "../../../src/infrastructure/logger.js";
import {
  MarkdownIngestionError,
  type MarkdownSource,
} from "../../../src/infrastructure/markdown/fetch-markdown.js";
import { QuizSessionPersistenceError } from "../../../src/infrastructure/persistence/quiz-session-repository.js";
import { createAnswers, createQuiz } from "../../support/quiz-fixtures.js";

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
  };
}

function createMarkdownSource(
  overrides: Partial<MarkdownSource> = {},
): MarkdownSource {
  return {
    chunkCount: 2,
    markdown: "# Guide\n\nImportant bounded markdown.",
    normalizedUrl: "https://raw.githubusercontent.com/acme/docs/main/guide.md",
    originalCharacters: 120,
    originalUrl: "https://github.com/acme/docs/blob/main/guide.md",
    retainedCharacters: 120,
    title: "Guide",
    wasTruncated: false,
    ...overrides,
  };
}

describe("createRunQuizSession", () => {
  it("returns a prepared quiz state from bounded source and validated quiz inputs", async () => {
    const source = createMarkdownSource();
    const quiz = createQuiz();
    const fetchMarkdown = vi.fn().mockResolvedValue(source);
    const generate = vi.fn().mockResolvedValue(quiz);
    const saveSession = vi.fn();
    const runQuizSession = createRunQuizSession({
      fetchMarkdown,
      quizGenerator: { generate },
      quizSessionRepository: { saveSession },
    });

    const prepared = await runQuizSession.prepare(source.originalUrl);

    expect(fetchMarkdown).toHaveBeenCalledWith(source.originalUrl);
    expect(generate).toHaveBeenCalledWith({ source });
    expect(prepared).toMatchObject({
      normalizedSourceUrl: source.normalizedUrl,
      questionCount: quiz.questions.length,
      sourceTitle: source.title,
      sourceUrl: source.originalUrl,
      wasSourceTruncated: source.wasTruncated,
    });
    expect(prepared.sessionToken).toEqual(expect.any(String));
    expect(prepared.questions).toEqual(
      quiz.questions.map((question) => ({
        id: question.id,
        options: question.options,
        prompt: question.prompt,
        type: question.type,
      })),
    );
    expect(prepared.questions[0]).not.toHaveProperty("correctOptionIds");
    expect(saveSession).not.toHaveBeenCalled();
  });

  it("returns an opaque session token instead of encoding quiz details into the handle", async () => {
    const source = createMarkdownSource();
    const quiz = createQuiz();
    const runQuizSession = createRunQuizSession({
      fetchMarkdown: vi.fn().mockResolvedValue(source),
      quizGenerator: { generate: vi.fn().mockResolvedValue(quiz) },
      quizSessionRepository: { saveSession: vi.fn() },
    });

    const prepared = await runQuizSession.prepare(source.originalUrl);

    expect(prepared.sessionToken).toEqual(expect.any(String));
    expect(prepared.sessionToken).not.toContain(source.normalizedUrl);
    expect(prepared.sessionToken).not.toContain(quiz.questions[0]!.id);
  });

  it("rejects complete with a token from a different RunQuizSession instance", async () => {
    const source = createMarkdownSource();
    const quiz = createQuiz();
    const prepared = await createRunQuizSession({
      fetchMarkdown: vi.fn().mockResolvedValue(source),
      quizGenerator: { generate: vi.fn().mockResolvedValue(quiz) },
      quizSessionRepository: { saveSession: vi.fn() },
    }).prepare(source.originalUrl);

    const differentInstance = createRunQuizSession({
      fetchMarkdown: vi.fn().mockResolvedValue(source),
      quizGenerator: { generate: vi.fn().mockResolvedValue(quiz) },
      quizSessionRepository: { saveSession: vi.fn() },
    });

    await expect(
      differentInstance.complete({
        answers: createAnswers({
          q1: ["q1-a"],
          q2: ["q2-a"],
          q3: ["q3-c"],
          q4: ["q4-a", "q4-c"],
          q5: ["q5-d"],
        }),
        sessionToken: prepared.sessionToken,
      }),
    ).rejects.toMatchObject({
      code: "invalid_prepared_session",
      stage: "complete",
    } satisfies Partial<RunQuizSessionError>);
  });

  it("cannot complete the same session twice", async () => {
    const source = createMarkdownSource();
    const quiz = createQuiz();
    const runQuizSession = createRunQuizSession({
      fetchMarkdown: vi.fn().mockResolvedValue(source),
      quizGenerator: { generate: vi.fn().mockResolvedValue(quiz) },
      quizSessionRepository: {
        saveSession: vi.fn().mockResolvedValue({
          createdAt: "2026-04-21T12:00:00.000Z",
          sessionId: "session-once",
        }),
      },
    });
    const answers = createAnswers({
      q1: ["q1-a"],
      q2: ["q2-a"],
      q3: ["q3-c"],
      q4: ["q4-a", "q4-c"],
      q5: ["q5-d"],
    });
    const prepared = await runQuizSession.prepare(source.originalUrl);

    await runQuizSession.complete({
      answers,
      sessionToken: prepared.sessionToken,
    });

    await expect(
      runQuizSession.complete({ answers, sessionToken: prepared.sessionToken }),
    ).rejects.toMatchObject({
      code: "invalid_prepared_session",
      stage: "complete",
    } satisfies Partial<RunQuizSessionError>);
  });

  it("scores answers and shapes persistence payloads through the domain scoring module", async () => {
    const source = createMarkdownSource();
    const quiz = createQuiz();
    const answers = createAnswers({
      q1: ["q1-a"],
      q2: ["q2-a"],
      q3: ["q3-c"],
      q4: ["q4-a", "q4-c"],
      q5: ["q5-d"],
    });
    const expectedScore = scoreQuiz(quiz, answers);
    const fetchMarkdown = vi.fn().mockResolvedValue(source);
    const generate = vi.fn().mockResolvedValue(quiz);
    const saveSession = vi.fn().mockResolvedValue({
      createdAt: "2026-04-21T12:00:00.000Z",
      sessionId: "session-123",
    });
    const runQuizSession = createRunQuizSession({
      fetchMarkdown,
      quizGenerator: { generate },
      quizSessionRepository: { saveSession },
    });

    const prepared = await runQuizSession.prepare(source.originalUrl);
    const completed = await runQuizSession.complete({
      answers,
      sessionToken: prepared.sessionToken,
    });

    expect(completed).toMatchObject({
      createdAt: "2026-04-21T12:00:00.000Z",
      finalScore: expectedScore.finalScore,
      normalizedSourceUrl: source.normalizedUrl,
      sessionId: "session-123",
      sourceTitle: source.title,
      sourceUrl: source.originalUrl,
      totalQuestionCount: quiz.questions.length,
    });
    expect(completed.questionResults).toEqual(
      quiz.questions.map((question, index) => ({
        correctOptionIds: question.correctOptionIds,
        options: question.options,
        pointsAwarded: expectedScore.questionResults[index]!.pointsAwarded,
        prompt: question.prompt,
        questionId: question.id,
        questionOrder: index + 1,
        questionType: question.type,
        selectedOptionIds: answers[index]!.selectedOptionIds,
        weightApplied: expectedScore.questionResults[index]!.weightApplied,
      })),
    );
    expect(saveSession).toHaveBeenCalledWith({
      answers: quiz.questions.map((question, index) => ({
        correctOptionIds: question.correctOptionIds,
        optionSnapshot: question.options,
        pointsAwarded: expectedScore.questionResults[index]!.pointsAwarded,
        questionId: question.id,
        questionOrder: index + 1,
        questionTextSnapshot: question.prompt,
        questionType: question.type,
        selectedOptionIds: answers[index]!.selectedOptionIds,
        weightApplied: expectedScore.questionResults[index]!.weightApplied,
      })),
      finalScore: expectedScore.finalScore,
      normalizedSourceUrl: source.normalizedUrl,
      sourceTitle: source.title,
      sourceUrl: source.originalUrl,
      totalQuestionCount: quiz.questions.length,
    });
  });

  it("rejects answer sets that do not match the prepared questions", async () => {
    const source = createMarkdownSource();
    const quiz = createQuiz();
    const runQuizSession = createRunQuizSession({
      fetchMarkdown: vi.fn().mockResolvedValue(source),
      quizGenerator: { generate: vi.fn().mockResolvedValue(quiz) },
      quizSessionRepository: {
        saveSession: vi.fn(),
      },
    });

    const prepared = await runQuizSession.prepare(source.originalUrl);

    await expect(
      runQuizSession.complete({
        answers: createAnswers({
          q1: ["q1-a"],
          q2: ["q2-a", "q2-b"],
          q3: ["q3-b"],
          q4: ["q4-a", "q4-c", "q4-d"],
          q6: ["q6-a"],
        }),
        sessionToken: prepared.sessionToken,
      }),
    ).rejects.toMatchObject({
      code: "invalid_answers",
      message: "Quiz answers must match the prepared questions and option ids",
      stage: "complete",
    } satisfies Partial<RunQuizSessionError>);
  });

  it("keeps the prepared session available when persistence fails so the same answers can be retried", async () => {
    const source = createMarkdownSource();
    const quiz = createQuiz();
    const answers = createAnswers({
      q1: ["q1-a"],
      q2: ["q2-a"],
      q3: ["q3-c"],
      q4: ["q4-a", "q4-c"],
      q5: ["q5-d"],
    });
    const saveSession = vi
      .fn()
      .mockRejectedValueOnce(new QuizSessionPersistenceError("DB write failed"))
      .mockResolvedValueOnce({
        createdAt: "2026-04-21T12:00:00.000Z",
        sessionId: "session-retried",
      });
    const runQuizSession = createRunQuizSession({
      fetchMarkdown: vi.fn().mockResolvedValue(source),
      quizGenerator: { generate: vi.fn().mockResolvedValue(quiz) },
      quizSessionRepository: { saveSession },
    });
    const prepared = await runQuizSession.prepare(source.originalUrl);

    await expect(
      runQuizSession.complete({
        answers,
        sessionToken: prepared.sessionToken,
      }),
    ).rejects.toMatchObject({
      code: "persistence_failed",
      stage: "complete",
    } satisfies Partial<RunQuizSessionError>);

    await expect(
      runQuizSession.complete({
        answers,
        sessionToken: prepared.sessionToken,
      }),
    ).resolves.toMatchObject({
      sessionId: "session-retried",
    });

    expect(saveSession).toHaveBeenCalledTimes(2);
  });

  describe("logging", () => {
    it("emits source_fetch_started and source_fetch_completed on successful prepare", async () => {
      const source = createMarkdownSource();
      const quiz = createQuiz();
      const logger = createMockLogger();
      const runQuizSession = createRunQuizSession({
        fetchMarkdown: vi.fn().mockResolvedValue(source),
        logger,
        quizGenerator: { generate: vi.fn().mockResolvedValue(quiz) },
        quizSessionRepository: { saveSession: vi.fn() },
      });

      await runQuizSession.prepare(source.originalUrl);

      expect(logger.info).toHaveBeenCalledWith("source_fetch_started", {
        sourceUrl: source.originalUrl,
      });
      expect(logger.info).toHaveBeenCalledWith("source_fetch_completed", {
        normalizedSourceUrl: source.normalizedUrl,
        sourceUrl: source.originalUrl,
        wasTruncated: source.wasTruncated,
      });
    });

    it("emits source_fetch_failed on markdown ingestion errors", async () => {
      const ingestionError = new MarkdownIngestionError({
        code: "timeout",
        message: "Request timed out",
        url: "https://example.com/guide.md",
      });
      const logger = createMockLogger();
      const runQuizSession = createRunQuizSession({
        fetchMarkdown: vi.fn().mockRejectedValue(ingestionError),
        logger,
        quizGenerator: { generate: vi.fn() },
        quizSessionRepository: { saveSession: vi.fn() },
      });

      await expect(
        runQuizSession.prepare("https://example.com/guide.md"),
      ).rejects.toBeInstanceOf(RunQuizSessionError);

      expect(logger.error).toHaveBeenCalledWith("source_fetch_failed", {
        errorType: "timeout",
        sourceUrl: "https://example.com/guide.md",
      });
    });

    it("emits session_persisted after a successful complete", async () => {
      const source = createMarkdownSource();
      const quiz = createQuiz();
      const logger = createMockLogger();
      const runQuizSession = createRunQuizSession({
        fetchMarkdown: vi.fn().mockResolvedValue(source),
        logger,
        quizGenerator: { generate: vi.fn().mockResolvedValue(quiz) },
        quizSessionRepository: {
          saveSession: vi.fn().mockResolvedValue({
            createdAt: "2026-04-21T12:00:00.000Z",
            sessionId: "session-abc",
          }),
        },
      });

      const prepared = await runQuizSession.prepare(source.originalUrl);
      await runQuizSession.complete({
        answers: createAnswers({
          q1: ["q1-a"],
          q2: ["q2-a"],
          q3: ["q3-c"],
          q4: ["q4-a", "q4-c"],
          q5: ["q5-d"],
        }),
        sessionToken: prepared.sessionToken,
      });

      expect(logger.info).toHaveBeenCalledWith("session_persisted", {
        sessionId: "session-abc",
      });
    });

    it("emits complete_failed on persistence errors", async () => {
      const source = createMarkdownSource();
      const quiz = createQuiz();
      const logger = createMockLogger();
      const runQuizSession = createRunQuizSession({
        fetchMarkdown: vi.fn().mockResolvedValue(source),
        logger,
        quizGenerator: { generate: vi.fn().mockResolvedValue(quiz) },
        quizSessionRepository: {
          saveSession: vi
            .fn()
            .mockRejectedValue(
              new QuizSessionPersistenceError("DB write failed"),
            ),
        },
      });

      const prepared = await runQuizSession.prepare(source.originalUrl);
      await expect(
        runQuizSession.complete({
          answers: createAnswers({
            q1: ["q1-a"],
            q2: ["q2-a"],
            q3: ["q3-c"],
            q4: ["q4-a", "q4-c"],
            q5: ["q5-d"],
          }),
          sessionToken: prepared.sessionToken,
        }),
      ).rejects.toBeInstanceOf(RunQuizSessionError);

      expect(logger.error).toHaveBeenCalledWith("complete_failed", {
        errorType: "persistence_failed",
      });
    });
  });

  it.each([
    [
      "maps invalid source URLs into a stable prepare error",
      async () => {
        const runQuizSession = createRunQuizSession({
          fetchMarkdown: vi.fn().mockRejectedValue(
            new MarkdownIngestionError({
              code: "invalid_url",
              message: "Source URL must be valid",
              url: "ftp://example.com/file.md",
            }),
          ),
          quizGenerator: { generate: vi.fn() },
          quizSessionRepository: { saveSession: vi.fn() },
        });

        await expect(
          runQuizSession.prepare("ftp://example.com/file.md"),
        ).rejects.toMatchObject({
          code: "invalid_source_url",
          stage: "prepare",
        } satisfies Partial<RunQuizSessionError>);
      },
    ],
    [
      "maps quiz generation failures into a stable prepare error",
      async () => {
        const source = createMarkdownSource();
        const runQuizSession = createRunQuizSession({
          fetchMarkdown: vi.fn().mockResolvedValue(source),
          quizGenerator: {
            generate: vi
              .fn()
              .mockRejectedValue(
                new QuizGenerationValidationError(
                  "Schema validation failed",
                  2,
                  ["questions"],
                ),
              ),
          },
          quizSessionRepository: { saveSession: vi.fn() },
        });

        await expect(
          runQuizSession.prepare(source.originalUrl),
        ).rejects.toMatchObject({
          code: "quiz_generation_failed",
          stage: "prepare",
        } satisfies Partial<RunQuizSessionError>);
      },
    ],
    [
      "maps persistence failures into a stable complete error",
      async () => {
        const source = createMarkdownSource();
        const quiz = createQuiz();
        const runQuizSession = createRunQuizSession({
          fetchMarkdown: vi.fn().mockResolvedValue(source),
          quizGenerator: { generate: vi.fn().mockResolvedValue(quiz) },
          quizSessionRepository: {
            saveSession: vi
              .fn()
              .mockRejectedValue(
                new QuizSessionPersistenceError(
                  "Failed to persist quiz session",
                ),
              ),
          },
        });
        const prepared = await runQuizSession.prepare(source.originalUrl);

        await expect(
          runQuizSession.complete({
            answers: createAnswers({
              q1: ["q1-a"],
              q2: ["q2-a", "q2-b"],
              q3: ["q3-b"],
              q4: ["q4-a", "q4-c", "q4-d"],
              q5: ["q5-d"],
            }),
            sessionToken: prepared.sessionToken,
          }),
        ).rejects.toMatchObject({
          code: "persistence_failed",
          stage: "complete",
        } satisfies Partial<RunQuizSessionError>);
      },
    ],
  ])("%s", async (_label, assertion) => {
    await assertion();
  });
});
