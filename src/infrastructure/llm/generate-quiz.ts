import {
  ChatOpenRouter,
  type ChatOpenRouterInput,
} from "@langchain/openrouter";

import { PROVIDER_LIMITS, PROVIDER_RULES } from "../../config/constants.js";
import { quizSchema } from "../../domain/quiz/schema.js";
import type { Quiz } from "../../domain/quiz/types.js";
import type { Logger } from "../logger.js";
import { createNoopLogger } from "../logger.js";
import type { MarkdownSource } from "../markdown/fetch-markdown.js";
import { buildQuizPrompt } from "./build-quiz-prompt.js";
import {
  QuizGenerationConfigError,
  QuizGenerationProviderError,
  QuizGenerationValidationError,
} from "./errors.js";

const MAX_GENERATION_ATTEMPTS = 2;

export interface QuizGenerator {
  generate(input: GenerateQuizInput): Promise<Quiz>;
}

export interface GenerateQuizInput {
  questionCount?: number;
  source: MarkdownSource;
}

export interface OpenRouterQuizModel {
  invoke(
    prompt: string,
    options?: { signal?: AbortSignal },
  ): Promise<StructuredQuizModelResponse>;
}

export interface OpenRouterQuizModelConfig {
  apiKey: string;
  model: string;
}

export interface StructuredQuizModelResponse {
  parsed: unknown;
  raw: unknown;
}

export type OpenRouterQuizModelFactory = (
  config: OpenRouterQuizModelConfig,
) => OpenRouterQuizModel;

export interface CreateOpenRouterQuizGeneratorOptions {
  buildPrompt?: typeof buildQuizPrompt;
  createModel?: OpenRouterQuizModelFactory;
  logger?: Logger;
}

export function createOpenRouterQuizGenerator(
  config: OpenRouterQuizModelConfig,
  options: CreateOpenRouterQuizGeneratorOptions = {},
): QuizGenerator {
  const providerConfig = validateProviderConfig(config);
  const promptBuilder = options.buildPrompt ?? buildQuizPrompt;
  const createModel = options.createModel ?? createDefaultOpenRouterQuizModel;
  const logger = options.logger ?? createNoopLogger();
  const model = createModel(providerConfig);

  return {
    async generate(input: GenerateQuizInput): Promise<Quiz> {
      const basePrompt = promptBuilder(input);
      let lastValidationIssues: string[] = [];

      for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
        const prompt =
          attempt === 1
            ? basePrompt
            : buildRetryPrompt(basePrompt, lastValidationIssues);

        logger.info("quiz_generation_attempt", {
          generationAttempt: attempt,
          providerModel: providerConfig.model,
        });

        let modelResponse: StructuredQuizModelResponse;
        const controller = new AbortController();
        const timeoutHandle = setTimeout(
          () => controller.abort(),
          PROVIDER_LIMITS.llmTimeoutMs,
        );

        try {
          modelResponse = await model.invoke(prompt, {
            signal: controller.signal,
          });
        } catch (error) {
          logger.error("quiz_generation_provider_error", {
            generationAttempt: attempt,
            providerModel: providerConfig.model,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          });
          throw new QuizGenerationProviderError(
            "OpenRouter quiz generation failed before a valid response was returned",
            attempt,
            error,
          );
        } finally {
          clearTimeout(timeoutHandle);
        }

        const parsedQuiz = parseQuizResponse(modelResponse);

        if (parsedQuiz.success) {
          return parsedQuiz.data;
        }

        logger.error("quiz_generation_schema_failure", {
          generationAttempt: attempt,
          providerModel: providerConfig.model,
          rawResponseSample: parsedQuiz.rawResponseSample,
          validationIssueCount: parsedQuiz.issueSummary.length,
          validationIssues: parsedQuiz.issueSummary,
        });
        lastValidationIssues = parsedQuiz.issueSummary;
      }

      throw new QuizGenerationValidationError(
        `OpenRouter returned quiz output that failed schema validation after ${MAX_GENERATION_ATTEMPTS} attempts`,
        MAX_GENERATION_ATTEMPTS,
        lastValidationIssues,
      );
    },
  };
}

function buildRetryPrompt(
  basePrompt: string,
  validationIssues: string[],
): string {
  if (validationIssues.length === 0) {
    return basePrompt;
  }

  return [
    basePrompt,
    "",
    "The previous response failed schema validation.",
    "Fix every issue below and return JSON only:",
    ...validationIssues.map((issue) => `- ${issue}`),
  ].join("\n");
}

export function validateProviderConfig(
  config: OpenRouterQuizModelConfig,
): OpenRouterQuizModelConfig {
  const apiKey = config.apiKey.trim();
  const model = config.model.trim();

  if (apiKey.length === 0) {
    throw new QuizGenerationConfigError(
      "OpenRouter API key is required for quiz generation",
    );
  }

  if (model.length === 0) {
    throw new QuizGenerationConfigError(
      "OpenRouter model id is required for quiz generation",
    );
  }

  if (model === PROVIDER_RULES.disallowedModelId) {
    throw new QuizGenerationConfigError(
      `OpenRouter model id must be pinned and cannot be "${PROVIDER_RULES.disallowedModelId}"`,
    );
  }

  return {
    apiKey,
    model,
  };
}

function createDefaultOpenRouterQuizModel(
  config: OpenRouterQuizModelConfig,
): OpenRouterQuizModel {
  const chatModel = new ChatOpenRouter({
    apiKey: config.apiKey,
    maxTokens: PROVIDER_LIMITS.llmMaxOutputTokens,
    model: config.model,
    provider: buildProviderPreferences(config.model),
    temperature: 0,
  } satisfies ChatOpenRouterInput);
  const structuredModel = chatModel.withStructuredOutput(quizSchema, {
    includeRaw: true,
    method: "jsonMode",
  });

  return {
    async invoke(
      prompt: string,
      options?: { signal?: AbortSignal },
    ): Promise<StructuredQuizModelResponse> {
      return structuredModel.invoke(prompt, {
        ...(options?.signal !== undefined ? { signal: options.signal } : {}),
      });
    },
  };
}

export function buildProviderPreferences(
  model: string,
): NonNullable<ChatOpenRouterInput["provider"]> {
  const preferences: NonNullable<ChatOpenRouterInput["provider"]> = {
    allow_fallbacks: false,
    require_parameters: true,
  };

  if (model.startsWith(PROVIDER_RULES.openaiModelPrefix)) {
    preferences.only = [PROVIDER_RULES.openaiProviderSlug];
  }

  return preferences;
}

function parseQuizResponse(response: StructuredQuizModelResponse):
  | {
      data: Quiz;
      success: true;
    }
  | {
      issueSummary: string[];
      rawResponseSample: string;
      success: false;
    } {
  const normalized = normalizeStructuredQuizResponse(response);
  const parsed = quizSchema.safeParse(normalized);

  if (parsed.success) {
    return {
      data: parsed.data,
      success: true,
    };
  }

  return {
    rawResponseSample: summarizeRawModelResponse(response),
    issueSummary: parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "quiz"}: ${issue.message}`,
    ),
    success: false,
  };
}

function normalizeStructuredQuizResponse(
  response: StructuredQuizModelResponse,
): unknown {
  if (response.parsed !== null && response.parsed !== undefined) {
    return response.parsed;
  }

  return extractStructuredResponseFallback(response.raw);
}

function extractStructuredResponseFallback(raw: unknown): unknown {
  if (!isRecord(raw)) {
    return raw;
  }

  const toolCalls = raw.tool_calls;

  if (Array.isArray(toolCalls)) {
    const [firstToolCall] = toolCalls;

    if (isRecord(firstToolCall) && "args" in firstToolCall) {
      return normalizeModelResponse(firstToolCall.args);
    }
  }

  if ("content" in raw) {
    return normalizeModelResponse(raw.content);
  }

  return raw;
}

function normalizeModelResponse(response: unknown): unknown {
  if (typeof response !== "string") {
    return response;
  }

  try {
    return JSON.parse(response) as unknown;
  } catch {
    return response;
  }
}

function summarizeRawModelResponse(
  response: StructuredQuizModelResponse,
): string {
  const extractedRaw = extractStructuredResponseFallback(response.raw);
  const serialized = serializeForLog(extractedRaw);

  if (serialized.length <= 400) {
    return serialized;
  }

  return `${serialized.slice(0, 400)}...`;
}

function serializeForLog(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
