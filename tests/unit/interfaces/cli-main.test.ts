import { describe, expect, it, vi } from 'vitest';

import { RunQuizSessionError } from '../../../src/application/errors.js';
import { QuizGenerationConfigError, QuizGenerationProviderError } from '../../../src/infrastructure/llm/errors.js';
import {
  CliCancelledError,
  formatCliError,
  formatStartupError,
  runCli,
  type CliProgress,
  type CliOutput,
} from '../../../src/interfaces/cli/main.js';

function createOutputCapture() {
  const progressCalls: Array<{ message: string; progress: CliProgress }> = [];
  const output = {
    cancel: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    intro: vi.fn(),
    outro: vi.fn(),
    progress: vi.fn((message: string) => {
      const progress = {
        error: vi.fn(),
        success: vi.fn(),
      } satisfies CliProgress;

      progressCalls.push({ message, progress });

      return progress;
    }),
    step: vi.fn(),
    success: vi.fn(),
  } satisfies CliOutput;

  return { output, progressCalls };
}

describe('CLI main helpers', () => {
  it.each([
    ['invalid_source_url', 'Enter a valid absolute http:// or https:// Markdown URL.'],
    ['source_unavailable', 'The Markdown source could not be loaded. Check the URL and try again.'],
    [
      'quiz_generation_failed',
      'A valid quiz could not be generated from that source right now. Try again in a moment.',
    ],
    [
      'persistence_failed',
      'Your answers were collected, but the session could not be saved. Please try again.',
    ],
    ['invalid_prepared_session', 'The quiz session became invalid. Start a new quiz and try again.'],
    ['invalid_answers', 'The quiz session became invalid. Start a new quiz and try again.'],
    [
      'unexpected_failure',
      'The quiz could not be completed because of an unexpected problem. Please try again.',
    ],
  ] as const)('formats %s errors for the CLI', (code, message) => {
    expect(
      formatCliError(
        new RunQuizSessionError({
          code,
          message: 'internal message',
          stage: code === 'persistence_failed' ? 'complete' : 'prepare',
        }),
      ),
    ).toBe(message);
  });

  it('falls back to a generic CLI error for unknown failures', () => {
    expect(formatCliError(new Error('boom'))).toBe(
      'The quiz could not be completed because of an unexpected problem. Please try again.',
    );
  });

  it('formats startup configuration failures without leaking internal detail', () => {
    expect(formatStartupError(new QuizGenerationConfigError('invalid model'))).toBe(
      'The CLI configuration is invalid. Check OPENROUTER_MODEL and try again.',
    );
    expect(
      formatStartupError(
        new Error('Invalid environment configuration: OPENROUTER_API_KEY: Invalid input'),
      ),
    ).toBe(
      'The CLI configuration is incomplete. Check OPENROUTER_API_KEY, OPENROUTER_MODEL, and DATABASE_PATH.',
    );
    expect(formatStartupError(new Error('database is locked'))).toBe(
      'The CLI could not start. Check your database path and configuration, then try again.',
    );
    expect(formatStartupError('not-an-error')).toBe(
      'The CLI could not start. Check your configuration and try again.',
    );
  });

  it('renders the cancel path without calling the application use case', async () => {
    const { output } = createOutputCapture();
    const prepare = vi.fn();

    const exitCode = await runCli({
      output,
      promptApi: {
        promptMultiSelect: vi.fn(),
        promptSelect: vi.fn(),
        promptText: vi.fn().mockRejectedValue(new CliCancelledError()),
      },
      runQuizSession: {
        complete: vi.fn(),
        prepare,
      },
    });

    expect(exitCode).toBe(1);
    expect(prepare).not.toHaveBeenCalled();
    expect(output.cancel).toHaveBeenCalledWith('Quiz cancelled.');
    expect(output.error).not.toHaveBeenCalled();
  });

  it('renders a generic error for unexpected CLI failures', async () => {
    const { output, progressCalls } = createOutputCapture();

    const exitCode = await runCli({
      output,
      promptApi: {
        promptMultiSelect: vi.fn(),
        promptSelect: vi.fn(),
        promptText: vi.fn().mockResolvedValue('https://example.com/guide.md'),
      },
      runQuizSession: {
        complete: vi.fn(),
        prepare: vi.fn().mockRejectedValue(new Error('boom')),
      },
    });

    expect(exitCode).toBe(1);
    expect(progressCalls).toHaveLength(1);
    expect(progressCalls[0]?.message).toBe('Preparing a quiz from your source...');
    expect(progressCalls[0]?.progress.error).toHaveBeenCalledWith(
      'The quiz could not be completed because of an unexpected problem. Please try again.',
    );
    expect(output.error).not.toHaveBeenCalled();
  });

  it('retries the source prompt after a recoverable prepare failure', async () => {
    const { output, progressCalls } = createOutputCapture();
    const promptText = vi
      .fn()
      .mockResolvedValueOnce('https://example.com/missing.md')
      .mockResolvedValueOnce('https://example.com/guide.md');
    const prepare = vi
      .fn()
      .mockRejectedValueOnce(
        new RunQuizSessionError({
          code: 'source_unavailable',
          message: 'Could not load bounded Markdown from the source URL',
          stage: 'prepare',
        }),
      )
      .mockResolvedValueOnce({
        normalizedSourceUrl: 'https://example.com/guide.md',
        questionCount: 1,
        questions: [
          {
            id: 'q1',
            options: [
              { id: 'q1-a', label: 'Option A' },
              { id: 'q1-b', label: 'Option B' },
              { id: 'q1-c', label: 'Option C' },
              { id: 'q1-d', label: 'Option D' },
            ],
            prompt: 'What changed?',
            type: 'single',
          },
        ],
        sessionToken: 'prepared-token',
        sourceTitle: 'Guide',
        sourceUrl: 'https://example.com/guide.md',
        wasSourceTruncated: false,
      });
    const complete = vi.fn().mockResolvedValue({
      createdAt: '2026-04-21T12:00:00.000Z',
      finalScore: 4,
      normalizedSourceUrl: 'https://example.com/guide.md',
      questionResults: [
        {
          pointsAwarded: 4,
          prompt: 'What changed?',
          questionId: 'q1',
          questionOrder: 1,
          questionType: 'single',
          selectedOptionIds: ['q1-a'],
          weightApplied: 1,
        },
      ],
      sessionId: 'session-123',
      sourceTitle: 'Guide',
      sourceUrl: 'https://example.com/guide.md',
      totalQuestionCount: 1,
    });

    const exitCode = await runCli({
      output,
      promptApi: {
        promptMultiSelect: vi.fn(),
        promptSelect: vi.fn().mockResolvedValue('q1-a'),
        promptText,
      },
      runQuizSession: {
        complete,
        prepare,
      },
    });

    expect(exitCode).toBe(0);
    expect(promptText).toHaveBeenCalledTimes(2);
    expect(prepare).toHaveBeenNthCalledWith(1, 'https://example.com/missing.md');
    expect(prepare).toHaveBeenNthCalledWith(2, 'https://example.com/guide.md');
    expect(progressCalls[0]?.progress.error).toHaveBeenCalledWith(
      'The Markdown source could not be loaded. Check the URL and try again.',
    );
    expect(progressCalls[1]?.progress.success).toHaveBeenCalledWith('Prepared 1 questions.');
    expect(output.info).toHaveBeenCalledWith('Paste another Markdown URL to try another source.');
    expect(progressCalls[2]?.progress.success).toHaveBeenCalledWith(
      'Quiz scored and session saved.',
    );
  });

  it('renders a model-specific hint when OpenRouter cannot route the required parameters', async () => {
    const { output, progressCalls } = createOutputCapture();
    const promptText = vi
      .fn()
      .mockResolvedValueOnce('https://example.com/guide.md')
      .mockRejectedValueOnce(new CliCancelledError());
    const prepare = vi.fn().mockRejectedValueOnce(
      new RunQuizSessionError({
        cause: new QuizGenerationProviderError(
          'provider rejected parameters',
          1,
          new Error(
            'No endpoints found that can handle the requested parameters. To learn more about provider routing, visit: https://openrouter.ai/docs/guides/routing/provider-selection',
          ),
        ),
        code: 'quiz_generation_failed',
        message: 'Could not generate a valid quiz from the bounded source Markdown',
        stage: 'prepare',
      }),
    );

    const exitCode = await runCli({
      output,
      promptApi: {
        promptMultiSelect: vi.fn(),
        promptSelect: vi.fn(),
        promptText,
      },
      providerModel: 'minimax/minimax-m2.5:free',
      runQuizSession: {
        complete: vi.fn(),
        prepare,
      },
    });

    expect(exitCode).toBe(1);
    expect(progressCalls).toHaveLength(1);
    expect(progressCalls[0]?.progress.error).toHaveBeenCalledWith(
      'The configured OpenRouter model (minimax/minimax-m2.5:free) cannot handle the required quiz-generation parameters.',
    );
    expect(output.info).toHaveBeenCalledWith(
      'Check OPENROUTER_MODEL or switch to another pinned model that supports structured output. Run npm run cli -- --debug to print provider logs.',
    );
    expect(output.info).toHaveBeenCalledWith('Paste another Markdown URL to try another source.');
    expect(output.cancel).toHaveBeenCalledWith('Quiz cancelled.');
  });
});
