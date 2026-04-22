import { describe, expect, it, vi } from 'vitest';

import {
  buildQuestionPromptMessage,
  promptForQuestion,
} from '../../../src/interfaces/cli/prompt-answers.js';

describe('CLI answer prompts', () => {
  it('labels multiple-answer questions before answer collection begins', () => {
    const message = buildQuestionPromptMessage(
      {
        id: 'q2',
        options: [
          { id: 'q2-a', label: 'Option A' },
          { id: 'q2-b', label: 'Option B' },
          { id: 'q2-c', label: 'Option C' },
          { id: 'q2-d', label: 'Option D' },
        ],
        prompt: 'Pick every correct answer.',
        type: 'multiple',
      },
      2,
      5,
    );

    expect(message).toContain('Question 2 of 5');
    expect(message).toContain('Multiple-answer question');
    expect(message).toContain('Select all that apply.');
    expect(message.indexOf('Multiple-answer question')).toBeLessThan(
      message.indexOf('Pick every correct answer.'),
    );
  });

  it('uses the multi-select prompt for multiple-answer questions', async () => {
    const promptSelect = vi.fn();
    const promptMultiSelect = vi.fn().mockResolvedValue(['q2-a', 'q2-c']);

    const answer = await promptForQuestion(
      {
        promptMultiSelect,
        promptSelect,
      },
      {
        id: 'q2',
        options: [
          { id: 'q2-a', label: 'Option A' },
          { id: 'q2-b', label: 'Option B' },
          { id: 'q2-c', label: 'Option C' },
          { id: 'q2-d', label: 'Option D' },
        ],
        prompt: 'Pick every correct answer.',
        type: 'multiple',
      },
      2,
      5,
    );

    expect(promptSelect).not.toHaveBeenCalled();
    expect(promptMultiSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Multiple-answer question'),
        required: true,
      }),
    );
    expect(answer).toEqual({
      questionId: 'q2',
      selectedOptionIds: ['q2-a', 'q2-c'],
    });
  });
});
