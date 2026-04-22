import {
  cancel,
  intro,
  isCancel,
  log,
  multiselect,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts";

import { FETCH_LIMITS } from "../../config/constants.js";
import { RunQuizSessionError } from "../../application/errors.js";
import {
  QuizGenerationConfigError,
  QuizGenerationProviderError,
  QuizGenerationValidationError,
} from "../../infrastructure/llm/errors.js";
import { MarkdownIngestionError } from "../../infrastructure/markdown/fetch-markdown.js";
import { CLI_DEBUG_LOGS_FLAG } from "../../infrastructure/logger.js";
import type {
  PreparedQuizSession,
  RunQuizSession,
} from "../../application/run-quiz-session.js";
import { promptForAnswers, type AnswerPromptApi } from "./prompt-answers.js";
import {
  promptSourceUrl,
  type SourceUrlPromptApi,
} from "./prompt-source-url.js";
import {
  formatSaveConfirmation,
  renderPreparedSourceSummary,
  renderResults,
} from "./render-results.js";

export interface CliProgress {
  error(message: string): void;
  success(message: string): void;
}

export interface CliOutput {
  cancel(message: string): void;
  error(message: string): void;
  info(message: string): void;
  intro(message: string): void;
  outro(message: string): void;
  progress(message: string): CliProgress;
  step(message: string): void;
  success(message: string): void;
}

export interface RunCliDependencies {
  debugLogsEnabled?: boolean | undefined;
  initialSourceUrl?: string | undefined;
  output: CliOutput;
  promptApi: AnswerPromptApi & SourceUrlPromptApi;
  providerModel?: string | undefined;
  runQuizSession: RunQuizSession;
}

export class CliCancelledError extends Error {
  override readonly name = "CliCancelledError";

  constructor() {
    super("CLI input was cancelled");
  }
}

class CliRenderedError extends Error {
  override readonly name = "CliRenderedError";

  constructor(cause?: unknown) {
    super("CLI error already rendered", cause ? { cause } : undefined);
  }
}

export function createClackOutput(): CliOutput {
  return {
    cancel: (message) => cancel(message),
    error: (message) => log.error(message),
    info: (message) => log.info(message),
    intro: (message) => intro(message),
    outro: (message) => outro(message),
    progress: (message) => {
      const progress = spinner();
      progress.start(message);

      return {
        error: (errorMessage) => progress.error(errorMessage),
        success: (successMessage) => progress.stop(successMessage),
      };
    },
    step: (message) => log.step(message),
    success: (message) => log.success(message),
  };
}

export function createClackPromptApi(): AnswerPromptApi & SourceUrlPromptApi {
  return {
    async promptMultiSelect(options) {
      const result = await multiselect<string>(options);

      return unwrapPromptResult(result);
    },

    async promptSelect(options) {
      const result = await select<string>(options);

      return unwrapPromptResult(result);
    },

    async promptText(options) {
      const result = await text(options);

      return unwrapPromptResult(result);
    },
  };
}

export function formatCliError(error: unknown): string {
  return describeCliError(error).message;
}

interface CliErrorPresentation {
  hint?: string | undefined;
  message: string;
}

interface CliErrorOptions {
  debugLogsEnabled?: boolean | undefined;
  providerModel?: string | undefined;
}

const CLI_DEBUG_COMMAND = `npm run cli -- ${CLI_DEBUG_LOGS_FLAG}`;

function describeCliError(
  error: unknown,
  options: CliErrorOptions = {},
): CliErrorPresentation {
  if (!(error instanceof RunQuizSessionError)) {
    return {
      message:
        "The quiz could not be completed because of an unexpected problem. Please try again.",
    };
  }

  switch (error.code) {
    case "invalid_source_url":
      return {
        message: "Enter a valid absolute http:// or https:// Markdown URL.",
      };
    case "source_unavailable":
      return describeSourceUnavailableError(error);
    case "quiz_generation_failed":
      return describeQuizGenerationError(error, options);
    case "persistence_failed":
      return {
        message:
          "Your answers were collected, but the session could not be saved. Please try again.",
      };
    case "invalid_prepared_session":
    case "invalid_answers":
      return {
        message:
          "The quiz session became invalid. Start a new quiz and try again.",
      };
    case "unexpected_failure":
      return {
        message:
          "The quiz could not be completed because of an unexpected problem. Please try again.",
      };
  }
}

export function formatStartupError(error: unknown): string {
  if (error instanceof QuizGenerationConfigError) {
    return "The CLI configuration is invalid. Check OPENROUTER_MODEL and try again.";
  }

  if (!(error instanceof Error)) {
    return "The CLI could not start. Check your configuration and try again.";
  }

  if (
    error.message.startsWith("Invalid environment configuration:") ||
    error.message.startsWith("Invalid database configuration:")
  ) {
    return "The CLI configuration is incomplete. Check OPENROUTER_API_KEY, OPENROUTER_MODEL, and DATABASE_PATH.";
  }

  return "The CLI could not start. Check your database path and configuration, then try again.";
}

export async function runCli(
  dependencies: RunCliDependencies,
): Promise<number> {
  const {
    debugLogsEnabled = false,
    initialSourceUrl,
    output,
    promptApi,
    providerModel,
    runQuizSession,
  } = dependencies;

  output.intro("Markdown Quiz");

  try {
    const preparedSession = await prepareQuizSession({
      debugLogsEnabled,
      initialSourceUrl,
      output,
      promptApi,
      providerModel,
      runQuizSession,
    });

    for (const line of renderPreparedSourceSummary(preparedSession)) {
      output.info(line);
    }

    output.info("Answer each question in order.");

    const answers = await promptForAnswers(
      promptApi,
      preparedSession.questions,
    );

    const completeProgress = output.progress(
      "Scoring your answers and saving the session...",
    );
    let completedSession;

    try {
      completedSession = await runQuizSession.complete({
        answers,
        sessionToken: preparedSession.sessionToken,
      });
      completeProgress.success("Quiz scored and session saved.");
    } catch (error) {
      const renderedError = describeCliError(error, {
        debugLogsEnabled,
        providerModel,
      });
      completeProgress.error(renderedError.message);
      renderCliHint(output, renderedError);
      throw new CliRenderedError(error);
    }

    for (const line of renderResults(completedSession)) {
      output.info(line);
    }

    output.outro(formatSaveConfirmation(completedSession.sessionId));

    return 0;
  } catch (error) {
    if (error instanceof CliRenderedError) {
      return 1;
    }

    if (error instanceof CliCancelledError) {
      output.cancel("Quiz cancelled.");
      return 1;
    }

    output.error(formatCliError(error));
    renderCliHint(
      output,
      describeCliError(error, {
        debugLogsEnabled,
        providerModel,
      }),
    );
    return 1;
  }
}

async function prepareQuizSession(
  dependencies: RunCliDependencies,
): Promise<PreparedQuizSession> {
  const { initialSourceUrl, output, promptApi, runQuizSession } = dependencies;
  const pendingSourceUrls = initialSourceUrl ? [initialSourceUrl] : [];

  while (true) {
    const sourceUrl =
      pendingSourceUrls.shift() ?? (await promptSourceUrl(promptApi));
    const prepareProgress = output.progress(
      "Preparing a quiz from your source...",
    );

    try {
      const preparedSession = await runQuizSession.prepare(sourceUrl);
      prepareProgress.success(
        `Prepared ${preparedSession.questionCount} questions.`,
      );
      return preparedSession;
    } catch (error) {
      if (error instanceof CliCancelledError) {
        throw error;
      }

      const renderedError = describeCliError(error, {
        debugLogsEnabled: dependencies.debugLogsEnabled,
        providerModel: dependencies.providerModel,
      });

      if (isRecoverablePrepareError(error)) {
        prepareProgress.error(renderedError.message);
        renderCliHint(output, renderedError);
        output.info("Paste another Markdown URL to try another source.");
        continue;
      }

      prepareProgress.error(renderedError.message);
      renderCliHint(output, renderedError);
      throw new CliRenderedError(error);
    }
  }
}

function isRecoverablePrepareError(
  error: unknown,
): error is RunQuizSessionError {
  return (
    error instanceof RunQuizSessionError &&
    error.stage === "prepare" &&
    (error.code === "invalid_source_url" || error.code === "source_unavailable")
  );
}

function unwrapPromptResult<T>(value: T | symbol): T {
  if (isCancel(value)) {
    throw new CliCancelledError();
  }

  return value;
}

function describeSourceUnavailableError(
  error: RunQuizSessionError,
): CliErrorPresentation {
  const sourceError = findCause(error, MarkdownIngestionError);

  if (!sourceError) {
    return {
      message:
        "The Markdown source could not be loaded. Check the URL and try again.",
    };
  }

  switch (sourceError.code) {
    case "timeout":
      return {
        message: `The Markdown source timed out after ${FETCH_LIMITS.timeoutMs} ms. Try again or use a faster URL.`,
      };
    case "http_error":
      return {
        message: sourceError.statusCode
          ? `The Markdown source returned HTTP ${sourceError.statusCode}. Check the URL and try again.`
          : "The Markdown source returned an HTTP error. Check the URL and try again.",
      };
    case "unsupported_content_type":
      return {
        message: "The source did not return Markdown or plain text content.",
      };
    case "response_too_large":
      return {
        message: "The Markdown source exceeds the 1 MiB size limit.",
      };
    case "redirect_limit":
      return {
        message:
          "The Markdown source redirected too many times. Try a direct raw Markdown URL.",
      };
    default:
      return {
        message:
          "The Markdown source could not be loaded. Check the URL and try again.",
      };
  }
}

function describeQuizGenerationError(
  error: RunQuizSessionError,
  options: CliErrorOptions,
): CliErrorPresentation {
  const providerModelLabel = options.providerModel
    ? ` (${options.providerModel})`
    : "";
  const providerError = findCause(error, QuizGenerationProviderError);

  if (providerError) {
    const providerCauseMessage = flattenErrorMessages(providerError);

    if (
      /no endpoints found that can handle the requested parameters/i.test(
        providerCauseMessage,
      )
    ) {
      return {
        message: `The configured OpenRouter model${providerModelLabel} cannot handle the required quiz-generation parameters.`,
        hint: buildDebugHint(
          options,
          "Check OPENROUTER_MODEL or switch to another pinned model that supports structured output.",
        ),
      };
    }

    if (
      /\b(401|403)\b|unauthorized|forbidden|api key/i.test(providerCauseMessage)
    ) {
      return {
        message:
          "OpenRouter rejected the quiz-generation request. Check OPENROUTER_API_KEY and model access.",
        hint: buildDebugHint(options),
      };
    }

    if (/\b429\b|rate limit/i.test(providerCauseMessage)) {
      return {
        message:
          "OpenRouter rate-limited the quiz-generation request. Try again in a moment.",
        hint: buildDebugHint(options),
      };
    }

    return {
      message: `OpenRouter failed before returning a valid quiz${providerModelLabel}.`,
      hint: buildDebugHint(options),
    };
  }

  const validationError = findCause(error, QuizGenerationValidationError);

  if (validationError) {
    return {
      message: `The configured model${providerModelLabel} returned quiz data that did not match the required schema.`,
      hint: buildDebugHint(
        options,
        "Try another pinned model if this keeps happening.",
      ),
    };
  }

  const configError = findCause(error, QuizGenerationConfigError);

  if (configError) {
    return {
      message:
        "Quiz generation is misconfigured. Check OPENROUTER_MODEL and try again.",
    };
  }

  return {
    message:
      "A valid quiz could not be generated from that source right now. Try again in a moment.",
    hint: buildDebugHint(options),
  };
}

function buildDebugHint(
  options: CliErrorOptions,
  hintPrefix?: string,
): string | undefined {
  if (options.debugLogsEnabled) {
    return undefined;
  }

  if (!hintPrefix) {
    return `Run ${CLI_DEBUG_COMMAND} to print provider logs.`;
  }

  return `${normalizeHintPrefix(hintPrefix)}. Run ${CLI_DEBUG_COMMAND} to print provider logs.`;
}

function flattenErrorMessages(error: Error): string {
  const messages: string[] = [];
  let current: unknown = error;
  let depth = 0;

  while (current instanceof Error && depth < 8) {
    if (current.message.trim().length > 0) {
      messages.push(current.message.trim());
    }

    current = current.cause;
    depth += 1;
  }

  return messages.join(" ");
}

function findCause<T extends Error>(
  error: Error,
  constructor: abstract new (...args: never[]) => T,
): T | undefined {
  let current: unknown = error;
  let depth = 0;

  while (current instanceof Error && depth < 8) {
    if (current instanceof constructor) {
      return current;
    }

    current = current.cause;
    depth += 1;
  }

  return undefined;
}

function renderCliHint(
  output: CliOutput,
  renderedError: CliErrorPresentation,
): void {
  if (!renderedError.hint) {
    return;
  }

  output.info(renderedError.hint);
}

function normalizeHintPrefix(value: string): string {
  return value.trim().replace(/[. ]+$/u, "");
}
