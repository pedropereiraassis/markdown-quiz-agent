export const QUIZ_QUESTION_LIMITS = Object.freeze({
  min: 5,
  max: 8,
});

export const QUIZ_OPTION_COUNT = 4;

export const MULTIPLE_CORRECT_OPTION_LIMITS = Object.freeze({
  min: 2,
  max: 4,
});

export const FETCH_LIMITS = Object.freeze({
  timeoutMs: 10_000,
  maxRedirects: 3,
  maxBytes: 1_048_576,
  promptCharCap: 24_000,
  preferredChunkChars: 2_000,
});

export const SUPPORTED_TEXT_CONTENT_TYPES = Object.freeze([
  "text/markdown",
  "text/plain",
  "text/x-markdown",
]);

export const SCORING_RULES = Object.freeze({
  maxPointsPerQuestion: 4,
  initialWeight: 1,
  weightMultiplier: 1.1,
});

export const PROVIDER_RULES = Object.freeze({
  openRouterProvider: "openrouter",
  disallowedModelId: "openrouter/auto",
  openaiModelPrefix: "openai/",
  openaiProviderSlug: "openai",
});

export const PROVIDER_LIMITS = Object.freeze({
  llmTimeoutMs: 60_000,
  llmMaxOutputTokens: 4_096,
});

export const AGENT_LIMITS = Object.freeze({
  maxAgentRounds: 8,
  roundPromptBudgetChars: 6_000,
  maxCorrectionRounds: 1,
});

export type QuizAgentMode = "auto" | "off" | "always";

export const QUIZ_AGENT_MODE_VALUES: readonly QuizAgentMode[] = Object.freeze([
  "auto",
  "off",
  "always",
]);
