import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createOpenRouterQuizGenerator,
  type OpenRouterQuizModel,
  type OpenRouterQuizModelConfig,
  type StructuredQuizModelResponse,
} from "../../../../src/infrastructure/llm/generate-quiz.js";
import {
  QuizGenerationConfigError,
  QuizGenerationProviderError,
  QuizGenerationValidationError,
} from "../../../../src/infrastructure/llm/errors.js";
import type { Logger } from "../../../../src/infrastructure/logger.js";
import { PROVIDER_LIMITS } from "../../../../src/config/constants.js";
import type { MarkdownSource } from "../../../../src/infrastructure/markdown/fetch-markdown.js";
import { createQuiz } from "../../../support/quiz-fixtures.js";

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
  };
}

function createMarkdownSource(
  overrides: Partial<MarkdownSource> = {},
): MarkdownSource {
  const markdown =
    overrides.markdown ?? "# Quiz Source\n\nFact one.\n\nFact two.";

  return {
    chunkCount: 1,
    markdown,
    normalizedUrl: "https://example.com/guide.md",
    originalCharacters: markdown.length,
    originalUrl: "https://example.com/guide.md",
    retainedCharacters: markdown.length,
    title: "Quiz Source",
    wasTruncated: false,
    ...overrides,
  };
}

function createConfig(
  overrides: Partial<OpenRouterQuizModelConfig> = {},
): OpenRouterQuizModelConfig {
  return {
    apiKey: "openrouter-key",
    model: "openai/gpt-4.1-mini",
    ...overrides,
  };
}

function createStructuredResponse(
  overrides: Partial<StructuredQuizModelResponse> = {},
): StructuredQuizModelResponse {
  return {
    parsed: null,
    raw: {
      content: "",
    },
    ...overrides,
  };
}

describe("createOpenRouterQuizGenerator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fails fast when the configured model id is missing, empty, or openrouter/auto", () => {
    expect(() =>
      createOpenRouterQuizGenerator(createConfig({ model: "" }), {
        createModel: () => {
          throw new Error("should not create model");
        },
      }),
    ).toThrow(QuizGenerationConfigError);

    expect(() =>
      createOpenRouterQuizGenerator(createConfig({ model: "   " }), {
        createModel: () => {
          throw new Error("should not create model");
        },
      }),
    ).toThrow(QuizGenerationConfigError);

    expect(() =>
      createOpenRouterQuizGenerator(
        createConfig({ model: "openrouter/auto" }),
        {
          createModel: () => {
            throw new Error("should not create model");
          },
        },
      ),
    ).toThrow(/pinned/);
  });

  it("returns a schema-valid quiz object", async () => {
    const quiz = createQuiz();
    const invoke = vi.fn<OpenRouterQuizModel["invoke"]>(async () =>
      createStructuredResponse({
        parsed: quiz,
        raw: {
          content: JSON.stringify(quiz),
        },
      }),
    );
    const generator = createOpenRouterQuizGenerator(createConfig(), {
      createModel: () => ({ invoke }),
    });

    await expect(
      generator.generate({
        questionCount: 5,
        source: createMarkdownSource(),
      }),
    ).resolves.toEqual(quiz);

    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once after a schema-invalid response", async () => {
    const quiz = createQuiz();
    const invoke = vi
      .fn<OpenRouterQuizModel["invoke"]>()
      .mockResolvedValueOnce(
        createStructuredResponse({
          raw: {
            content: JSON.stringify({ questions: [{ id: "broken" }] }),
          },
        }),
      )
      .mockResolvedValueOnce(
        createStructuredResponse({
          parsed: quiz,
          raw: {
            content: JSON.stringify(quiz),
          },
        }),
      );

    const generator = createOpenRouterQuizGenerator(createConfig(), {
      createModel: () => ({ invoke }),
    });

    const result = await generator.generate({
      questionCount: 5,
      source: createMarkdownSource(),
    });

    expect(result).toEqual(quiz);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1]?.[0]).toContain(
      "The previous response failed schema validation.",
    );
    expect(invoke.mock.calls[1]?.[0]).toContain("questions.0.type");
  });

  it("returns a typed validation error after two consecutive schema-invalid responses", async () => {
    const invoke = vi.fn<OpenRouterQuizModel["invoke"]>().mockResolvedValue(
      createStructuredResponse({
        raw: {
          content: JSON.stringify({ questions: [{ id: "broken" }] }),
        },
      }),
    );

    const generator = createOpenRouterQuizGenerator(createConfig(), {
      createModel: () => ({ invoke }),
    });

    await expect(
      generator.generate({
        questionCount: 5,
        source: createMarkdownSource(),
      }),
    ).rejects.toSatisfy((error) => {
      expect(error).toBeInstanceOf(QuizGenerationValidationError);
      expect(error).toMatchObject({
        attemptCount: 2,
        code: "schema_validation_failed",
      });
      expect(error.issueSummary).not.toHaveLength(0);
      return true;
    });

    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("throws QuizGenerationProviderError when the LLM call exceeds the timeout", async () => {
    vi.useFakeTimers();

    const invoke = vi.fn(
      async (_prompt: string, options?: { signal?: AbortSignal }) => {
        return new Promise<never>((_, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        });
      },
    );

    const generator = createOpenRouterQuizGenerator(createConfig(), {
      createModel: () => ({ invoke }),
    });

    const generatePromise = generator.generate({
      questionCount: 5,
      source: createMarkdownSource(),
    });
    // Attach rejection handler before advancing timers to prevent unhandled-rejection warnings.
    const assertion = expect(generatePromise).rejects.toBeInstanceOf(
      QuizGenerationProviderError,
    );

    await vi.advanceTimersByTimeAsync(PROVIDER_LIMITS.llmTimeoutMs + 1);
    await assertion;
  });

  it("passes the configured pinned model id into the provider factory", () => {
    const createModel = vi.fn(() => ({
      invoke: vi.fn(async () =>
        createStructuredResponse({
          parsed: createQuiz(),
          raw: {
            content: JSON.stringify(createQuiz()),
          },
        }),
      ),
    }));

    createOpenRouterQuizGenerator(
      createConfig({ model: "anthropic/claude-4-sonnet" }),
      {
        createModel,
      },
    );

    expect(createModel).toHaveBeenCalledWith({
      apiKey: "openrouter-key",
      model: "anthropic/claude-4-sonnet",
    });
  });

  describe("logging", () => {
    it("emits quiz_generation_attempt for each attempt", async () => {
      const quiz = createQuiz();
      const logger = createMockLogger();
      const generator = createOpenRouterQuizGenerator(createConfig(), {
        createModel: () => ({
          invoke: vi.fn(async () =>
            createStructuredResponse({
              parsed: quiz,
              raw: {
                content: JSON.stringify(quiz),
              },
            }),
          ),
        }),
        logger,
      });

      await generator.generate({ source: createMarkdownSource() });

      expect(logger.info).toHaveBeenCalledWith("quiz_generation_attempt", {
        generationAttempt: 1,
        providerModel: "openai/gpt-4.1-mini",
      });
    });

    it("emits quiz_generation_schema_failure when validation fails", async () => {
      const quiz = createQuiz();
      const logger = createMockLogger();
      const generator = createOpenRouterQuizGenerator(createConfig(), {
        createModel: () => ({
          invoke: vi
            .fn<OpenRouterQuizModel["invoke"]>()
            .mockResolvedValueOnce(
              createStructuredResponse({
                raw: {
                  content: JSON.stringify({ questions: [{ id: "broken" }] }),
                },
              }),
            )
            .mockResolvedValueOnce(
              createStructuredResponse({
                parsed: quiz,
                raw: {
                  content: JSON.stringify(quiz),
                },
              }),
            ),
        }),
        logger,
      });

      await generator.generate({ source: createMarkdownSource() });

      expect(logger.error).toHaveBeenCalledWith(
        "quiz_generation_schema_failure",
        {
          generationAttempt: 1,
          providerModel: "openai/gpt-4.1-mini",
          rawResponseSample: expect.any(String),
          validationIssueCount: expect.any(Number),
          validationIssues: expect.any(Array),
        },
      );
    });
  });
});
