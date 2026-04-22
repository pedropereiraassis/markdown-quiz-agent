import { z } from "zod";

import {
  MULTIPLE_CORRECT_OPTION_LIMITS,
  QUIZ_OPTION_COUNT,
  QUIZ_QUESTION_LIMITS,
} from "../../config/constants.js";

export const stableIdSchema = z.string().trim().min(1, "Ids must be non-empty");
export const nonEmptyTextSchema = z
  .string()
  .trim()
  .min(1, "Text must be non-empty");
export const questionTypeSchema = z.enum(["single", "multiple"]);

export const questionOptionSchema = z.strictObject({
  id: stableIdSchema,
  label: nonEmptyTextSchema,
});

const questionBaseFields = {
  id: stableIdSchema,
  prompt: nonEmptyTextSchema,
  options: z
    .array(questionOptionSchema)
    .length(
      QUIZ_OPTION_COUNT,
      `Questions must have exactly ${QUIZ_OPTION_COUNT} options`,
    ),
};

function addDuplicateIssues(
  values: string[],
  ctx: z.RefinementCtx,
  pathPrefix: (string | number)[],
  label: string,
): void {
  const seen = new Set<string>();

  values.forEach((value, index) => {
    if (seen.has(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...pathPrefix, index],
        message: `${label} "${value}" must be unique`,
      });
      return;
    }

    seen.add(value);
  });
}

function validateQuestionInvariants(
  question: {
    options: Array<{ id: string }>;
    correctOptionIds: string[];
  },
  ctx: z.RefinementCtx,
): void {
  const optionIds = question.options.map((option) => option.id);
  const validOptionIds = new Set(optionIds);

  addDuplicateIssues(optionIds, ctx, ["options"], "Option id");
  addDuplicateIssues(
    question.correctOptionIds,
    ctx,
    ["correctOptionIds"],
    "Correct option id",
  );

  question.correctOptionIds.forEach((optionId, index) => {
    if (!validOptionIds.has(optionId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correctOptionIds", index],
        message: `Correct option id "${optionId}" must match one of the declared option ids`,
      });
    }
  });
}

export const singleQuestionSchema = z
  .strictObject({
    ...questionBaseFields,
    type: z.literal("single"),
    correctOptionIds: z
      .array(stableIdSchema)
      .length(1, "Single-answer questions must have exactly 1 correct option"),
  })
  .superRefine(validateQuestionInvariants);

export const multipleQuestionSchema = z
  .strictObject({
    ...questionBaseFields,
    type: z.literal("multiple"),
    correctOptionIds: z
      .array(stableIdSchema)
      .min(
        MULTIPLE_CORRECT_OPTION_LIMITS.min,
        `Multiple-answer questions must have between ${MULTIPLE_CORRECT_OPTION_LIMITS.min} and ${MULTIPLE_CORRECT_OPTION_LIMITS.max} correct options`,
      )
      .max(
        MULTIPLE_CORRECT_OPTION_LIMITS.max,
        `Multiple-answer questions must have between ${MULTIPLE_CORRECT_OPTION_LIMITS.min} and ${MULTIPLE_CORRECT_OPTION_LIMITS.max} correct options`,
      ),
  })
  .superRefine(validateQuestionInvariants);

export const quizQuestionSchema = z.discriminatedUnion("type", [
  singleQuestionSchema,
  multipleQuestionSchema,
]);

export const questionAnswerSchema = z.strictObject({
  questionId: stableIdSchema,
  selectedOptionIds: z
    .array(stableIdSchema)
    .max(
      QUIZ_OPTION_COUNT,
      `Answers cannot select more than ${QUIZ_OPTION_COUNT} options`,
    )
    .superRefine((selectedOptionIds, ctx) => {
      addDuplicateIssues(selectedOptionIds, ctx, [], "Selected option id");
    }),
});

export interface QuizQuestionValidationResult {
  success: boolean;
  issues: string[];
}

export function validateQuizQuestion(
  candidate: unknown,
): QuizQuestionValidationResult {
  const parsed = quizQuestionSchema.safeParse(candidate);

  if (parsed.success) {
    return { success: true, issues: [] };
  }

  const issues = parsed.error.issues.map(
    (issue) => `${issue.path.join(".") || "question"}: ${issue.message}`,
  );

  return { success: false, issues };
}

export const quizSchema = z
  .strictObject({
    questions: z
      .array(quizQuestionSchema)
      .min(
        QUIZ_QUESTION_LIMITS.min,
        `Quizzes must contain between ${QUIZ_QUESTION_LIMITS.min} and ${QUIZ_QUESTION_LIMITS.max} questions`,
      )
      .max(
        QUIZ_QUESTION_LIMITS.max,
        `Quizzes must contain between ${QUIZ_QUESTION_LIMITS.min} and ${QUIZ_QUESTION_LIMITS.max} questions`,
      ),
  })
  .superRefine((quiz, ctx) => {
    addDuplicateIssues(
      quiz.questions.map((question) => question.id),
      ctx,
      ["questions"],
      "Question id",
    );
  });
