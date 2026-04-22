import { describe, expect, it } from 'vitest';

import { quizSchema } from '../../../src/domain/quiz/schema.js';
import {
  createMultipleQuestion,
  createQuiz,
  createSingleQuestion,
} from '../../support/quiz-fixtures.js';

describe('quizSchema', () => {
  it('accepts a valid quiz with 5 questions', () => {
    const parsed = quizSchema.parse(createQuiz());

    expect(parsed.questions).toHaveLength(5);
  });

  it('rejects quizzes with fewer than 5 questions', () => {
    const quiz = createQuiz([
      createSingleQuestion('q1'),
      createSingleQuestion('q2'),
      createSingleQuestion('q3'),
      createSingleQuestion('q4'),
    ]);

    expect(() => quizSchema.parse(quiz)).toThrow(/between 5 and 8 questions/);
  });

  it('rejects quizzes with more than 8 questions', () => {
    const quiz = createQuiz([
      createSingleQuestion('q1'),
      createSingleQuestion('q2'),
      createSingleQuestion('q3'),
      createSingleQuestion('q4'),
      createSingleQuestion('q5'),
      createSingleQuestion('q6'),
      createSingleQuestion('q7'),
      createSingleQuestion('q8'),
      createSingleQuestion('q9'),
    ]);

    expect(() => quizSchema.parse(quiz)).toThrow(/between 5 and 8 questions/);
  });

  it('rejects questions without exactly 4 options', () => {
    const quiz = createQuiz([
      {
        ...createSingleQuestion('q1'),
        options: [
          { id: 'q1-a', label: 'A' },
          { id: 'q1-b', label: 'B' },
          { id: 'q1-c', label: 'C' },
        ],
      },
      createSingleQuestion('q2'),
      createSingleQuestion('q3'),
      createSingleQuestion('q4'),
      createSingleQuestion('q5'),
    ]);

    expect(() => quizSchema.parse(quiz)).toThrow(/exactly 4 options/);
  });

  it('rejects invalid correct-option cardinality for single and multiple questions', () => {
    const singleQuiz = createQuiz([
      {
        ...createSingleQuestion('q1'),
        correctOptionIds: ['q1-a', 'q1-b'],
      },
      createSingleQuestion('q2'),
      createSingleQuestion('q3'),
      createSingleQuestion('q4'),
      createSingleQuestion('q5'),
    ]);

    const multipleQuiz = createQuiz([
      {
        ...createMultipleQuestion('q1'),
        correctOptionIds: ['q1-a'],
      },
      createSingleQuestion('q2'),
      createSingleQuestion('q3'),
      createSingleQuestion('q4'),
      createSingleQuestion('q5'),
    ]);

    expect(() => quizSchema.parse(singleQuiz)).toThrow(/exactly 1 correct option/);
    expect(() => quizSchema.parse(multipleQuiz)).toThrow(/between 2 and 4 correct options/);
  });

  it('rejects duplicate ids and correct option ids that do not exist in the options', () => {
    const quiz = createQuiz([
      {
        ...createMultipleQuestion('q1'),
        options: [
          { id: 'q1-a', label: 'A' },
          { id: 'q1-a', label: 'B' },
          { id: 'q1-c', label: 'C' },
          { id: 'q1-d', label: 'D' },
        ],
        correctOptionIds: ['q1-a', 'q1-z'],
      },
      createSingleQuestion('q2'),
      createSingleQuestion('q2'),
      createSingleQuestion('q4'),
      createSingleQuestion('q5'),
    ]);

    expect(() => quizSchema.parse(quiz)).toThrow(/must be unique|must match one of the declared option ids/);
  });
});
