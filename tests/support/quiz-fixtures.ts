import type {
  QuestionAnswer,
  Quiz,
  QuizQuestion,
} from "../../src/domain/quiz/types.js";

function createOptions(questionId: string) {
  return [
    { id: `${questionId}-a`, label: `Option A for ${questionId}` },
    { id: `${questionId}-b`, label: `Option B for ${questionId}` },
    { id: `${questionId}-c`, label: `Option C for ${questionId}` },
    { id: `${questionId}-d`, label: `Option D for ${questionId}` },
  ];
}

export function createSingleQuestion(
  questionId: string,
  correctOptionId = `${questionId}-a`,
): QuizQuestion {
  return {
    id: questionId,
    prompt: `Prompt for ${questionId}`,
    type: "single",
    options: createOptions(questionId),
    correctOptionIds: [correctOptionId],
  };
}

export function createMultipleQuestion(
  questionId: string,
  correctOptionIds = [`${questionId}-a`, `${questionId}-b`],
): QuizQuestion {
  return {
    id: questionId,
    prompt: `Prompt for ${questionId}`,
    type: "multiple",
    options: createOptions(questionId),
    correctOptionIds,
  };
}

export function createQuiz(questions?: QuizQuestion[]): Quiz {
  return {
    questions: questions ?? [
      createSingleQuestion("q1", "q1-a"),
      createMultipleQuestion("q2", ["q2-a", "q2-b"]),
      createSingleQuestion("q3", "q3-b"),
      createMultipleQuestion("q4", ["q4-a", "q4-c", "q4-d"]),
      createSingleQuestion("q5", "q5-d"),
    ],
  };
}

export function createAnswers(
  selectedOptionIdsByQuestionId: Record<string, string[]>,
): QuestionAnswer[] {
  return Object.entries(selectedOptionIdsByQuestionId).map(
    ([questionId, selectedOptionIds]) => ({
      questionId,
      selectedOptionIds,
    }),
  );
}
