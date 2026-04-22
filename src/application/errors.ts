export type RunQuizSessionErrorCode =
  | 'invalid_answers'
  | 'invalid_prepared_session'
  | 'invalid_source_url'
  | 'persistence_failed'
  | 'quiz_generation_failed'
  | 'source_unavailable'
  | 'unexpected_failure';

export type RunQuizSessionStage = 'complete' | 'prepare';

interface RunQuizSessionErrorOptions {
  cause?: unknown;
  code: RunQuizSessionErrorCode;
  message: string;
  stage: RunQuizSessionStage;
}

export class RunQuizSessionError extends Error {
  readonly code: RunQuizSessionErrorCode;
  readonly stage: RunQuizSessionStage;

  constructor(options: RunQuizSessionErrorOptions) {
    super(options.message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'RunQuizSessionError';
    this.code = options.code;
    this.stage = options.stage;
  }
}
