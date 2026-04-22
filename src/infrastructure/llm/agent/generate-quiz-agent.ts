import {
  ChatOpenRouter,
  type ChatOpenRouterInput,
} from "@langchain/openrouter";
import { createAgent } from "langchain";

import {
  AGENT_LIMITS,
  PROVIDER_LIMITS,
  QUIZ_QUESTION_LIMITS,
} from "../../../config/constants.js";
import type { Quiz } from "../../../domain/quiz/types.js";
import type { Logger } from "../../logger.js";
import { createNoopLogger } from "../../logger.js";
import { buildAgentChunkWindows } from "../../markdown/build-agent-chunk-windows.js";
import type { AgentChunkWindow } from "../../markdown/build-agent-chunk-windows.js";
import {
  type GenerateQuizInput,
  type OpenRouterQuizModelConfig,
  type QuizGenerator,
  buildProviderPreferences,
  validateProviderConfig,
} from "../generate-quiz.js";
import {
  QuizGenerationInputError,
  QuizGenerationProviderError,
  QuizGenerationValidationError,
} from "../errors.js";
import { createAgentOrchestratorState } from "./agent-state.js";
import { createAgentTools } from "./tools.js";
import { validateAgentQuiz } from "./validate-agent-quiz.js";

export interface QuizAgentRunner {
  invoke(
    input: { messages: Array<{ role: "user"; content: string }> },
    options?: { signal?: AbortSignal; recursionLimit?: number },
  ): Promise<unknown>;
}

export interface CreateQuizAgentRunnerOptions {
  model: ChatOpenRouter;
  systemPrompt: string;
  tools: ReturnType<typeof createAgentTools>;
}

export type CreateQuizAgentRunner = (
  options: CreateQuizAgentRunnerOptions,
) => QuizAgentRunner;

export interface CreateOpenRouterAgentQuizGeneratorOptions {
  createAgentRunner?: CreateQuizAgentRunner;
  createModel?: (config: OpenRouterQuizModelConfig) => ChatOpenRouter;
  logger?: Logger;
}

export function createOpenRouterAgentQuizGenerator(
  config: OpenRouterQuizModelConfig,
  options: CreateOpenRouterAgentQuizGeneratorOptions = {},
): QuizGenerator {
  const providerConfig = validateProviderConfig(config);
  const logger = options.logger ?? createNoopLogger();
  const createModel = options.createModel ?? createDefaultOpenRouterAgentModel;
  const createRunner =
    options.createAgentRunner ?? createDefaultQuizAgentRunner;

  return {
    async generate(input: GenerateQuizInput): Promise<Quiz> {
      const questionCount = validateQuestionCount(
        input.questionCount ?? QUIZ_QUESTION_LIMITS.min,
      );
      const fullMarkdown = (
        input.source.fullMarkdown ?? input.source.markdown
      ).trim();

      if (fullMarkdown.length === 0) {
        throw new QuizGenerationInputError(
          "Agent quiz generation requires non-empty normalized Markdown",
        );
      }

      const windowsResult = buildAgentChunkWindows(fullMarkdown, {
        maxWindows: AGENT_LIMITS.maxAgentRounds,
        windowCharBudget: AGENT_LIMITS.roundPromptBudgetChars,
      });
      logger.info("quiz_generation_agent_started", {
        originalCharacters: input.source.originalCharacters,
        promptCharacters: input.source.markdown.length,
        providerModel: providerConfig.model,
        questionCount,
        totalChunkCount: windowsResult.totalChunkCount,
        totalWindowCharacters: windowsResult.totalCharacterCount,
        windowCount: windowsResult.windows.length,
        windowsWereMerged: windowsResult.wasCapped,
      });
      const initialExecution = createExecutionContext(
        providerConfig,
        windowsResult.windows,
        questionCount,
        createModel,
        createRunner,
        logger,
      );

      await invokeAgentRunner(
        initialExecution.runner,
        buildGenerationInstruction(input, windowsResult.windows, questionCount),
        1,
      );

      const finalizedQuiz = initialExecution.state.finalizeQuiz();
      const firstValidation = validateFinalizedQuiz(
        finalizedQuiz,
        windowsResult.windows,
      );

      if (firstValidation.success) {
        logger.info("quiz_generation_agent_completed", {
          attemptCount: 1,
          questionCount: firstValidation.quiz.questions.length,
        });
        return firstValidation.quiz;
      }

      logger.error("quiz_generation_agent_validation_failure", {
        providerModel: providerConfig.model,
        validationIssues: firstValidation.issues,
        validationIssueCount: firstValidation.issues.length,
      });

      const correctionExecution = createExecutionContext(
        providerConfig,
        windowsResult.windows,
        questionCount,
        createModel,
        createRunner,
        logger,
      );

      await invokeAgentRunner(
        correctionExecution.runner,
        buildCorrectionInstruction(firstValidation.issues),
        2,
      );

      const correctedQuiz = correctionExecution.state.finalizeQuiz();
      const secondValidation = validateFinalizedQuiz(
        correctedQuiz,
        windowsResult.windows,
      );

      if (secondValidation.success) {
        logger.info("quiz_generation_agent_completed", {
          attemptCount: 2,
          questionCount: secondValidation.quiz.questions.length,
        });
        return secondValidation.quiz;
      }

      logger.error("quiz_generation_agent_failed", {
        attemptCount: 2,
        providerModel: providerConfig.model,
        validationIssueCount: secondValidation.issues.length,
        validationIssues: secondValidation.issues,
      });

      throw new QuizGenerationValidationError(
        "Agent quiz generation returned invalid output after the correction round",
        2,
        secondValidation.issues,
      );
    },
  };

  async function invokeAgentRunner(
    runner: QuizAgentRunner,
    content: string,
    attempt: number,
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(
      () => controller.abort(),
      PROVIDER_LIMITS.llmTimeoutMs,
    );

    try {
      logger.info("quiz_generation_agent_attempt_started", {
        attempt,
        messageCharacters: content.length,
      });
      await runner.invoke(
        {
          messages: [{ role: "user", content }],
        },
        {
          recursionLimit: AGENT_LIMITS.maxAgentRounds * 8,
          signal: controller.signal,
        },
      );
      logger.info("quiz_generation_agent_attempt_completed", {
        attempt,
      });
    } catch (error) {
      logger.error("quiz_generation_agent_attempt_failed", {
        attempt,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw new QuizGenerationProviderError(
        "OpenRouter agent quiz generation failed before a valid response was returned",
        attempt,
        error,
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

function createExecutionContext(
  providerConfig: OpenRouterQuizModelConfig,
  windows: readonly AgentChunkWindow[],
  questionCount: number,
  createModel: (config: OpenRouterQuizModelConfig) => ChatOpenRouter,
  createRunner: CreateQuizAgentRunner,
  logger: Logger,
): {
  runner: QuizAgentRunner;
  state: ReturnType<typeof createAgentOrchestratorState>;
} {
  const state = createAgentOrchestratorState({
    windows,
    targetQuestionCount: questionCount,
  });
  const tools = createAgentTools(state, logger);
  const runner = createRunner({
    model: createModel(providerConfig),
    systemPrompt: buildAgentSystemPrompt(questionCount),
    tools,
  });

  logger.info("quiz_generation_agent_execution_context_created", {
    questionCount,
    windowCount: windows.length,
  });

  return { runner, state };
}

function createDefaultOpenRouterAgentModel(
  config: OpenRouterQuizModelConfig,
): ChatOpenRouter {
  return new ChatOpenRouter({
    apiKey: config.apiKey,
    maxTokens: PROVIDER_LIMITS.llmMaxOutputTokens,
    model: config.model,
    provider: buildProviderPreferences(config.model),
    temperature: 0,
  } satisfies ChatOpenRouterInput);
}

function createDefaultQuizAgentRunner(
  options: CreateQuizAgentRunnerOptions,
): QuizAgentRunner {
  return createAgent({
    model: options.model,
    systemPrompt: options.systemPrompt,
    tools: [...options.tools],
  });
}

function buildAgentSystemPrompt(questionCount: number): string {
  return [
    "You generate a source-grounded multiple-choice quiz from Markdown chunks only.",
    "Use tools instead of inventing source content.",
    `Produce exactly ${questionCount} questions total.`,
    "Keep questions answerable from the source windows alone.",
    "Call get_next_chunk until it reports done, use propose_questions to add candidates, then call finalize_quiz exactly once.",
    "If finalize_quiz returns issues, fix them with propose_questions and call finalize_quiz again.",
  ].join("\n");
}

function buildGenerationInstruction(
  input: GenerateQuizInput,
  windows: readonly AgentChunkWindow[],
  questionCount: number,
): string {
  return [
    `Generate exactly ${questionCount} quiz questions.`,
    `Source title: ${input.source.title?.trim() || "Untitled source"}`,
    `Source URL: ${input.source.normalizedUrl}`,
    `Window count available: ${windows.length}`,
    "Use the tools to read the source windows in order and build the quiz.",
  ].join("\n");
}

function buildCorrectionInstruction(issues: readonly string[]): string {
  return [
    "The current draft is invalid.",
    "Fix every issue below using the tools, then call finalize_quiz again:",
    ...issues.map((issue) => `- ${issue}`),
  ].join("\n");
}

function validateQuestionCount(questionCount: number): number {
  if (!Number.isInteger(questionCount)) {
    throw new QuizGenerationInputError(
      "Quiz generation questionCount must be an integer",
    );
  }

  if (
    questionCount < QUIZ_QUESTION_LIMITS.min ||
    questionCount > QUIZ_QUESTION_LIMITS.max
  ) {
    throw new QuizGenerationInputError(
      `Quiz generation questionCount must be between ${QUIZ_QUESTION_LIMITS.min} and ${QUIZ_QUESTION_LIMITS.max}`,
    );
  }

  return questionCount;
}

function validateFinalizedQuiz(
  finalizedQuiz: {
    success: boolean;
    quiz: Quiz | null;
    issues: string[];
  },
  windows: readonly AgentChunkWindow[],
):
  | { success: true; quiz: Quiz; issues: [] }
  | { success: false; issues: string[] } {
  if (!finalizedQuiz.success || finalizedQuiz.quiz === null) {
    return {
      success: false,
      issues: finalizedQuiz.issues,
    };
  }

  const validation = validateAgentQuiz(finalizedQuiz.quiz, windows);

  if (!validation.success) {
    return {
      success: false,
      issues: validation.issues,
    };
  }

  return {
    success: true,
    quiz: finalizedQuiz.quiz,
    issues: [],
  };
}
