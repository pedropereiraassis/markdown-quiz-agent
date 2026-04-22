export type QuizGenerationErrorCode =
  | "invalid_config"
  | "invalid_input"
  | "provider_error"
  | "schema_validation_failed";

interface QuizGenerationErrorOptions {
  cause?: unknown;
  code: QuizGenerationErrorCode;
  message: string;
}

export class QuizGenerationError extends Error {
  readonly code: QuizGenerationErrorCode;

  constructor(options: QuizGenerationErrorOptions) {
    super(
      options.message,
      options.cause ? { cause: options.cause } : undefined,
    );
    this.name = "QuizGenerationError";
    this.code = options.code;
  }
}

export class QuizGenerationConfigError extends QuizGenerationError {
  constructor(message: string) {
    super({
      code: "invalid_config",
      message,
    });
    this.name = "QuizGenerationConfigError";
  }
}

export class QuizGenerationInputError extends QuizGenerationError {
  constructor(message: string) {
    super({
      code: "invalid_input",
      message,
    });
    this.name = "QuizGenerationInputError";
  }
}

export class QuizGenerationProviderError extends QuizGenerationError {
  readonly attempt: number;

  constructor(message: string, attempt: number, cause?: unknown) {
    super({
      cause,
      code: "provider_error",
      message,
    });
    this.name = "QuizGenerationProviderError";
    this.attempt = attempt;
  }
}

export class QuizGenerationValidationError extends QuizGenerationError {
  readonly attemptCount: number;
  readonly issueSummary: string[];

  constructor(message: string, attemptCount: number, issueSummary: string[]) {
    super({
      code: "schema_validation_failed",
      message,
    });
    this.name = "QuizGenerationValidationError";
    this.attemptCount = attemptCount;
    this.issueSummary = issueSummary;
  }
}
