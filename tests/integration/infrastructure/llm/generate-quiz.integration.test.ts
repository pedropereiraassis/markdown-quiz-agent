import { describe, expect, it, vi } from 'vitest';

import {
  createOpenRouterQuizGenerator,
  type OpenRouterQuizModel,
  type OpenRouterQuizModelConfig,
  type StructuredQuizModelResponse,
} from '../../../../src/infrastructure/llm/generate-quiz.js';
import { QuizGenerationValidationError } from '../../../../src/infrastructure/llm/errors.js';
import type { MarkdownSource } from '../../../../src/infrastructure/markdown/fetch-markdown.js';
import { createQuiz } from '../../../support/quiz-fixtures.js';

function createMarkdownSource(overrides: Partial<MarkdownSource> = {}): MarkdownSource {
  const markdown = overrides.markdown ?? '# Integration Source\n\nFact one.\n\n## Section\n\nFact two.';

  return {
    chunkCount: 2,
    markdown,
    normalizedUrl: 'https://example.com/integration.md',
    originalCharacters: markdown.length,
    originalUrl: 'https://example.com/integration.md',
    retainedCharacters: markdown.length,
    title: 'Integration Source',
    wasTruncated: false,
    ...overrides,
  };
}

function createConfig(overrides: Partial<OpenRouterQuizModelConfig> = {}): OpenRouterQuizModelConfig {
  return {
    apiKey: 'integration-key',
    model: 'openai/gpt-4.1-mini',
    ...overrides,
  };
}

function createStructuredResponse(
  overrides: Partial<StructuredQuizModelResponse> = {},
): StructuredQuizModelResponse {
  return {
    parsed: null,
    raw: {
      content: '',
    },
    ...overrides,
  };
}

describe('OpenRouter quiz generator integration', () => {
  it('generates a validated quiz end to end with a stubbed OpenRouter response', async () => {
    const capturedPrompts: string[] = [];
    const quiz = createQuiz();
    const generator = createOpenRouterQuizGenerator(createConfig(), {
      createModel: () => ({
        invoke: vi.fn<OpenRouterQuizModel['invoke']>(async (prompt: string) => {
          capturedPrompts.push(prompt);
          return createStructuredResponse({
            parsed: quiz,
            raw: {
              content: JSON.stringify(quiz),
            },
          });
        }),
      }),
    });

    const result = await generator.generate({
      questionCount: 5,
      source: createMarkdownSource(),
    });

    expect(result).toEqual(quiz);
    expect(capturedPrompts).toHaveLength(1);
    expect(capturedPrompts[0]).toContain('Generate exactly 5 questions.');
    expect(capturedPrompts[0]).toContain('SOURCE MARKDOWN');
    expect(capturedPrompts[0]).toContain('# Integration Source');
  });

  it('retries once and then fails clearly when stubbed responses stay invalid', async () => {
    const invoke = vi
      .fn<OpenRouterQuizModel['invoke']>()
      .mockResolvedValue(
        createStructuredResponse({
          raw: {
            content: JSON.stringify({ questions: [{ id: 'bad' }] }),
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
        code: 'schema_validation_failed',
      });
      return true;
    });

    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
