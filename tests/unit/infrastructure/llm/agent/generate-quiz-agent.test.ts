import { afterEach, describe, expect, it, vi } from "vitest";

import { PROVIDER_LIMITS } from "../../../../../src/config/constants.js";
import {
  createOpenRouterAgentQuizGenerator,
  type CreateQuizAgentRunnerOptions,
  type QuizAgentRunner,
} from "../../../../../src/infrastructure/llm/agent/generate-quiz-agent.js";
import {
  QuizGenerationProviderError,
  QuizGenerationValidationError,
} from "../../../../../src/infrastructure/llm/errors.js";
import type { Logger } from "../../../../../src/infrastructure/logger.js";
import type { MarkdownSource } from "../../../../../src/infrastructure/markdown/fetch-markdown.js";

function createMarkdownSource(
  overrides: Partial<MarkdownSource> = {},
): MarkdownSource {
  const fullMarkdown =
    overrides.fullMarkdown ??
    [
      "# Mercury",
      "",
      "Mercury is the smallest planet in the solar system.",
      "",
      "# Venus",
      "",
      "Venus is the hottest planet.",
    ].join("\n");
  const markdown = overrides.markdown ?? fullMarkdown.slice(0, 60);

  return {
    chunkCount: 1,
    fullMarkdown,
    markdown,
    normalizedUrl: "https://example.com/guide.md",
    originalCharacters: fullMarkdown.length,
    originalUrl: "https://example.com/guide.md",
    retainedCharacters: markdown.length,
    title: "Planets",
    wasTruncated: true,
    ...overrides,
  };
}

function createAgentFactory(
  runnerFactory: (options: CreateQuizAgentRunnerOptions) => QuizAgentRunner,
) {
  return vi.fn(runnerFactory);
}

function createGroundedQuiz() {
  return {
    questions: [
      {
        id: "q1",
        prompt: "Which planet is the smallest in the solar system?",
        type: "single" as const,
        options: [
          { id: "q1-a", label: "Mercury" },
          { id: "q1-b", label: "Venus" },
          { id: "q1-c", label: "Earth" },
          { id: "q1-d", label: "Mars" },
        ],
        correctOptionIds: ["q1-a"],
      },
      {
        id: "q2",
        prompt: "Which planet is described as the hottest planet?",
        type: "single" as const,
        options: [
          { id: "q2-a", label: "Mercury" },
          { id: "q2-b", label: "Venus" },
          { id: "q2-c", label: "Earth" },
          { id: "q2-d", label: "Mars" },
        ],
        correctOptionIds: ["q2-b"],
      },
      {
        id: "q3",
        prompt: "Which heading appears in the source besides Mercury?",
        type: "single" as const,
        options: [
          { id: "q3-a", label: "Venus" },
          { id: "q3-b", label: "Jupiter" },
          { id: "q3-c", label: "Saturn" },
          { id: "q3-d", label: "Neptune" },
        ],
        correctOptionIds: ["q3-a"],
      },
      {
        id: "q4",
        prompt: "The source says Mercury is the smallest what?",
        type: "single" as const,
        options: [
          { id: "q4-a", label: "Planet" },
          { id: "q4-b", label: "Moon" },
          { id: "q4-c", label: "Comet" },
          { id: "q4-d", label: "Asteroid" },
        ],
        correctOptionIds: ["q4-a"],
      },
      {
        id: "q5",
        prompt: "Which planet name appears in the first heading?",
        type: "single" as const,
        options: [
          { id: "q5-a", label: "Mercury" },
          { id: "q5-b", label: "Venus" },
          { id: "q5-c", label: "Earth" },
          { id: "q5-d", label: "Mars" },
        ],
        correctOptionIds: ["q5-a"],
      },
    ],
  };
}

function createUngroundedQuiz() {
  return {
    questions: [
      {
        id: "q1",
        prompt: "Which galaxy is farthest from Andromeda?",
        type: "single" as const,
        options: [
          { id: "q1-a", label: "Option A" },
          { id: "q1-b", label: "Option B" },
          { id: "q1-c", label: "Option C" },
          { id: "q1-d", label: "Option D" },
        ],
        correctOptionIds: ["q1-a"],
      },
      {
        id: "q2",
        prompt: "Which nebula is brightest?",
        type: "single" as const,
        options: [
          { id: "q2-a", label: "Option A" },
          { id: "q2-b", label: "Option B" },
          { id: "q2-c", label: "Option C" },
          { id: "q2-d", label: "Option D" },
        ],
        correctOptionIds: ["q2-a"],
      },
      {
        id: "q3",
        prompt: "Which telescope found the pulsar?",
        type: "single" as const,
        options: [
          { id: "q3-a", label: "Option A" },
          { id: "q3-b", label: "Option B" },
          { id: "q3-c", label: "Option C" },
          { id: "q3-d", label: "Option D" },
        ],
        correctOptionIds: ["q3-a"],
      },
      {
        id: "q4",
        prompt: "Which cluster is most distant?",
        type: "single" as const,
        options: [
          { id: "q4-a", label: "Option A" },
          { id: "q4-b", label: "Option B" },
          { id: "q4-c", label: "Option C" },
          { id: "q4-d", label: "Option D" },
        ],
        correctOptionIds: ["q4-a"],
      },
      {
        id: "q5",
        prompt: "Which quasar is oldest?",
        type: "single" as const,
        options: [
          { id: "q5-a", label: "Option A" },
          { id: "q5-b", label: "Option B" },
          { id: "q5-c", label: "Option C" },
          { id: "q5-d", label: "Option D" },
        ],
        correctOptionIds: ["q5-a"],
      },
    ],
  };
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

function createLoggerStub(): Logger {
  return {
    error: vi.fn(),
    info: vi.fn(),
  };
}

describe("createOpenRouterAgentQuizGenerator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a quiz after a successful tool-driven round", async () => {
    const quiz = createGroundedQuiz();
    const deferred = createDeferred();
    const logger = createLoggerStub();
    const createAgentRunner = createAgentFactory(() => ({
      invoke: vi.fn(async () => deferred.promise),
    }));
    const generator = createOpenRouterAgentQuizGenerator(
      { apiKey: "key", model: "openai/gpt-4.1-mini" },
      {
        createAgentRunner,
        createModel: () => ({}) as never,
        logger,
      },
    );

    const generatePromise = generator.generate({
      questionCount: 5,
      source: createMarkdownSource(),
    });
    const [options] = createAgentRunner.mock.calls[0] ?? [];
    const getNextChunkTool = options?.tools[0];
    const proposeQuestionsTool = options?.tools[1];
    const finalizeQuizTool = options?.tools[2];

    await getNextChunkTool?.invoke({});
    await proposeQuestionsTool?.invoke({ questions: quiz.questions });
    await finalizeQuizTool?.invoke({});
    deferred.resolve();

    await expect(generatePromise).resolves.toEqual(quiz);
    expect(logger.info).toHaveBeenCalledWith(
      "quiz_generation_agent_started",
      expect.objectContaining({
        providerModel: "openai/gpt-4.1-mini",
        questionCount: 5,
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      "quiz_generation_agent_attempt_started",
      expect.objectContaining({ attempt: 1 }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      "quiz_generation_agent_tool_get_next_chunk",
      expect.objectContaining({ done: false }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      "quiz_generation_agent_tool_propose_questions_completed",
      expect.objectContaining({
        acceptedCount: 5,
        draftSize: 5,
        remainingSlots: 0,
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      "quiz_generation_agent_completed",
      {
        attemptCount: 1,
        questionCount: 5,
      },
    );
  });

  it("runs one correction round after validator issues", async () => {
    const groundedQuiz = createGroundedQuiz();
    const invalidQuiz = createUngroundedQuiz();

    let invocation = 0;
    const createAgentRunner = createAgentFactory((options) => ({
      invoke: vi.fn(async () => {
        invocation += 1;
        const [, proposeQuestionsTool] = options.tools;
        await proposeQuestionsTool?.invoke({
          questions:
            invocation === 1 ? invalidQuiz.questions : groundedQuiz.questions,
        });
      }),
    }));
    const generator = createOpenRouterAgentQuizGenerator(
      { apiKey: "key", model: "openai/gpt-4.1-mini" },
      {
        createAgentRunner,
        createModel: () => ({}) as never,
      },
    );

    await expect(
      generator.generate({
        questionCount: 5,
        source: createMarkdownSource(),
      }),
    ).resolves.toEqual(groundedQuiz);

    const firstRunner = createAgentRunner.mock.results[0]?.value;
    const secondRunner = createAgentRunner.mock.results[1]?.value;
    expect(firstRunner?.invoke).toHaveBeenCalledTimes(1);
    expect(secondRunner?.invoke).toHaveBeenCalledTimes(1);
  });

  it("throws a validation error after the correction round still fails", async () => {
    const invalidQuiz = createUngroundedQuiz();
    const createAgentRunner = createAgentFactory((options) => ({
      invoke: vi.fn(async () => {
        const [, proposeQuestionsTool] = options.tools;
        await proposeQuestionsTool?.invoke({
          questions: invalidQuiz.questions,
        });
      }),
    }));
    const generator = createOpenRouterAgentQuizGenerator(
      { apiKey: "key", model: "openai/gpt-4.1-mini" },
      {
        createAgentRunner,
        createModel: () => ({}) as never,
      },
    );

    await expect(
      generator.generate({
        questionCount: 5,
        source: createMarkdownSource(),
      }),
    ).rejects.toBeInstanceOf(QuizGenerationValidationError);
  });

  it("maps runner failures to QuizGenerationProviderError", async () => {
    const generator = createOpenRouterAgentQuizGenerator(
      { apiKey: "key", model: "openai/gpt-4.1-mini" },
      {
        createAgentRunner: () => ({
          invoke: vi.fn(async () => {
            throw new Error("provider failed");
          }),
        }),
        createModel: () => ({}) as never,
      },
    );

    await expect(
      generator.generate({
        questionCount: 5,
        source: createMarkdownSource(),
      }),
    ).rejects.toBeInstanceOf(QuizGenerationProviderError);
  });

  it("maps timeout aborts to QuizGenerationProviderError", async () => {
    vi.useFakeTimers();

    const generator = createOpenRouterAgentQuizGenerator(
      { apiKey: "key", model: "openai/gpt-4.1-mini" },
      {
        createAgentRunner: () => ({
          invoke: vi.fn(
            async (_input, options?: { signal?: AbortSignal }) =>
              new Promise<never>((_, reject) => {
                options?.signal?.addEventListener("abort", () => {
                  reject(
                    new DOMException("The operation was aborted", "AbortError"),
                  );
                });
              }),
          ),
        }),
        createModel: () => ({}) as never,
      },
    );

    const generatePromise = generator.generate({
      questionCount: 5,
      source: createMarkdownSource(),
    });
    const assertion = expect(generatePromise).rejects.toBeInstanceOf(
      QuizGenerationProviderError,
    );

    await vi.advanceTimersByTimeAsync(PROVIDER_LIMITS.llmTimeoutMs + 1);
    await assertion;
  });
});
