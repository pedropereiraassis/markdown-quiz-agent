import type { QuestionOption } from '../../domain/quiz/types.js';

export function serializeOptionSnapshot(options: readonly QuestionOption[]): string {
  return JSON.stringify(options.map((option) => ({ id: option.id, label: option.label })));
}

export function serializeOptionIdSnapshot(optionIds: readonly string[]): string {
  return JSON.stringify([...optionIds]);
}
