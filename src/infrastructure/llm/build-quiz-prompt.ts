import {
  FETCH_LIMITS,
  QUIZ_OPTION_COUNT,
  QUIZ_QUESTION_LIMITS,
} from "../../config/constants.js";
import type { MarkdownSource } from "../markdown/fetch-markdown.js";
import { QuizGenerationInputError } from "./errors.js";

export interface BuildQuizPromptInput {
  questionCount?: number;
  source: MarkdownSource;
}

export function buildQuizPrompt(input: BuildQuizPromptInput): string {
  const questionCount = validateQuestionCount(
    input.questionCount ?? QUIZ_QUESTION_LIMITS.min,
  );
  const markdown = input.source.markdown.trim();

  if (markdown.length === 0) {
    throw new QuizGenerationInputError(
      "Quiz generation requires non-empty bounded Markdown",
    );
  }

  if (
    input.source.retainedCharacters > FETCH_LIMITS.promptCharCap ||
    markdown.length > FETCH_LIMITS.promptCharCap
  ) {
    throw new QuizGenerationInputError(
      `Quiz generation source exceeds the ${FETCH_LIMITS.promptCharCap} character prompt cap`,
    );
  }

  const sourceTitle = input.source.title?.trim() || "Untitled source";
  const truncationNote = input.source.wasTruncated
    ? "The source was truncated to the bounded Markdown window. Use only the retained content below."
    : "The source below is the full bounded Markdown passed to the model.";

  return [
    "You generate source-grounded multiple-choice quizzes from Markdown only.",
    "Use only the supplied source content. Do not invent facts, cite outside knowledge, or add commentary.",
    "",
    "Return a JSON object with this shape:",
    '{ "questions": [ ... ] }',
    "",
    `Quiz requirements:`,
    `- Generate exactly ${questionCount} questions.`,
    `- Each question must have exactly ${QUIZ_OPTION_COUNT} options.`,
    `- Question type "single" must have exactly 1 correct option id.`,
    `- Question type "multiple" must have between 2 and 4 correct option ids.`,
    "- Every question needs stable non-empty ids for the question and each option.",
    "- Keep questions answerable from the source alone and avoid duplicate questions.",
    "- Return JSON only with no markdown fences or prose.",
    "",
    "Source metadata:",
    `- Title: ${sourceTitle}`,
    `- URL: ${input.source.normalizedUrl}`,
    `- Truncated: ${input.source.wasTruncated ? "yes" : "no"}`,
    `- Retained characters: ${input.source.retainedCharacters}`,
    "",
    truncationNote,
    "",
    "SOURCE MARKDOWN",
    markdown,
  ].join("\n");
}

function validateQuestionCount(questionCount: number): number {
  if (!Number.isInteger(questionCount)) {
    throw new QuizGenerationInputError(
      "Quiz generation questionCount must be an integer",
    );
  }

  if (
    questionCount < QUIZ_QUESTION_LIMITS.min ||
    questionCount > QUIZ_QUESTION_LIMITS.max
  ) {
    throw new QuizGenerationInputError(
      `Quiz generation questionCount must be between ${QUIZ_QUESTION_LIMITS.min} and ${QUIZ_QUESTION_LIMITS.max}`,
    );
  }

  return questionCount;
}
