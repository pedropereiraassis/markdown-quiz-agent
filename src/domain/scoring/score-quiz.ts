import { SCORING_RULES } from '../../config/constants.js';
import type {
  QuestionAnswer,
  Quiz,
  QuizQuestion,
  ScoredQuestionResult,
  ScoredQuizResult,
} from '../quiz/types.js';

function assertUniqueSelectionIds(selectedOptionIds: string[]): void {
  const uniqueSelections = new Set(selectedOptionIds);

  if (uniqueSelections.size !== selectedOptionIds.length) {
    throw new Error('Selected option ids must be unique');
  }
}

function buildAnswerMap(answers: QuestionAnswer[]): Map<string, QuestionAnswer> {
  const answersByQuestionId = new Map<string, QuestionAnswer>();

  for (const answer of answers) {
    if (answersByQuestionId.has(answer.questionId)) {
      throw new Error(`Duplicate answer for question "${answer.questionId}"`);
    }

    answersByQuestionId.set(answer.questionId, answer);
  }

  return answersByQuestionId;
}

function clampScore(score: number): number {
  return Math.min(Math.max(score, 0), SCORING_RULES.maxPointsPerQuestion);
}

export function scoreSingleAnswerQuestion(
  correctOptionId: string,
  selectedOptionIds: string[],
): number {
  assertUniqueSelectionIds(selectedOptionIds);

  return selectedOptionIds.length === 1 && selectedOptionIds[0] === correctOptionId
    ? SCORING_RULES.maxPointsPerQuestion
    : 0;
}

export function scoreMultipleAnswerQuestion(
  correctOptionIds: string[],
  selectedOptionIds: string[],
): number {
  assertUniqueSelectionIds(selectedOptionIds);

  if (correctOptionIds.length === 0) {
    throw new Error('Multiple-answer questions must define at least one correct option');
  }

  const correctSelections = new Set(correctOptionIds);
  let matchingSelections = 0;
  let wrongExtraSelections = 0;

  selectedOptionIds.forEach((selectedOptionId) => {
    if (correctSelections.has(selectedOptionId)) {
      matchingSelections += 1;
      return;
    }

    wrongExtraSelections += 1;
  });

  const rawScore =
    (SCORING_RULES.maxPointsPerQuestion *
      (matchingSelections - wrongExtraSelections)) /
    correctSelections.size;

  return clampScore(rawScore);
}

export function scoreQuestion(question: QuizQuestion, selectedOptionIds: string[]): number {
  if (question.type === 'single') {
    const [correctOptionId] = question.correctOptionIds;

    if (!correctOptionId) {
      throw new Error(`Single-answer question "${question.id}" is missing its correct option id`);
    }

    return scoreSingleAnswerQuestion(correctOptionId, selectedOptionIds);
  }

  return scoreMultipleAnswerQuestion(question.correctOptionIds, selectedOptionIds);
}

export function getQuestionWeight(questionOrder: number): number {
  if (!Number.isInteger(questionOrder) || questionOrder < 1) {
    throw new Error('Question order must be a positive integer');
  }

  let weight = SCORING_RULES.initialWeight;

  for (let index = 1; index < questionOrder; index += 1) {
    weight *= SCORING_RULES.weightMultiplier;
  }

  return weight;
}

export function getQuestionWeights(questionCount: number): number[] {
  if (!Number.isInteger(questionCount) || questionCount < 1) {
    throw new Error('Question count must be a positive integer');
  }

  return Array.from({ length: questionCount }, (_, index) => getQuestionWeight(index + 1));
}

export function scoreQuiz(quiz: Quiz, answers: QuestionAnswer[]): ScoredQuizResult {
  const answersByQuestionId = buildAnswerMap(answers);
  const questionWeights = getQuestionWeights(quiz.questions.length);
  const questionResults: ScoredQuestionResult[] = [];

  let weightedPointsTotal = 0;
  let totalWeight = 0;

  quiz.questions.forEach((question, index) => {
    const answer = answersByQuestionId.get(question.id);

    if (!answer) {
      throw new Error(`Missing answer for question "${question.id}"`);
    }

    const weightApplied = questionWeights[index]!;
    const pointsAwarded = scoreQuestion(question, answer.selectedOptionIds);

    weightedPointsTotal += pointsAwarded * weightApplied;
    totalWeight += weightApplied;
    questionResults.push({
      questionId: question.id,
      questionOrder: index + 1,
      questionType: question.type,
      selectedOptionIds: [...answer.selectedOptionIds],
      pointsAwarded,
      weightApplied,
    });
  });

  return {
    questionResults,
    finalScore: weightedPointsTotal / totalWeight,
  };
}

export function roundScoreForDisplay(score: number, fractionDigits = 2): number {
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 10) {
    throw new Error('fractionDigits must be an integer between 0 and 10');
  }

  return Number(score.toFixed(fractionDigits));
}
