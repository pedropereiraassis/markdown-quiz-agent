import { describe, expect, it } from 'vitest';

import {
  parseEnv,
  questionAnswerSchema,
  quizSchema,
  roundScoreForDisplay,
  scoreQuiz,
} from '../../src/index.js';
import { createQuiz } from '../support/quiz-fixtures.js';

describe('config/domain entrypoints', () => {
  it('load together without schema drift across config, validation, and scoring', () => {
    const env = parseEnv({
      OPENROUTER_API_KEY: 'integration-key',
      OPENROUTER_MODEL: 'openai/gpt-4.1-mini',
      DATABASE_PATH: './tmp/integration.sqlite',
    });

    const quiz = quizSchema.parse(createQuiz());
    const answers = [
      questionAnswerSchema.parse({ questionId: 'q1', selectedOptionIds: ['q1-a'] }),
      questionAnswerSchema.parse({ questionId: 'q2', selectedOptionIds: ['q2-a', 'q2-b'] }),
      questionAnswerSchema.parse({ questionId: 'q3', selectedOptionIds: ['q3-b'] }),
      questionAnswerSchema.parse({ questionId: 'q4', selectedOptionIds: ['q4-a', 'q4-c', 'q4-d'] }),
      questionAnswerSchema.parse({ questionId: 'q5', selectedOptionIds: ['q5-d'] }),
    ];

    const result = scoreQuiz(quiz, answers);

    expect(env.provider.model).toBe('openai/gpt-4.1-mini');
    expect(result.questionResults).toHaveLength(5);
    expect(result.questionResults.every((entry) => entry.pointsAwarded === 4)).toBe(true);
    expect(result.finalScore).toBe(4);
    expect(roundScoreForDisplay(result.finalScore, 0)).toBe(4);
  });
});
