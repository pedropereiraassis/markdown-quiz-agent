import { z } from 'zod';

import {
  questionAnswerSchema,
  questionOptionSchema,
  questionTypeSchema,
  quizQuestionSchema,
  quizSchema,
} from './schema.js';

export type QuestionType = z.infer<typeof questionTypeSchema>;
export type QuestionOption = z.infer<typeof questionOptionSchema>;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type Quiz = z.infer<typeof quizSchema>;
export type QuestionAnswer = z.infer<typeof questionAnswerSchema>;

export interface ScoredQuestionResult {
  questionId: string;
  questionOrder: number;
  questionType: QuestionType;
  selectedOptionIds: string[];
  pointsAwarded: number;
  weightApplied: number;
}

export interface ScoredQuizResult {
  questionResults: ScoredQuestionResult[];
  finalScore: number;
}
