import {
  QUIZ_QUESTION_LIMITS,
  QUIZ_OPTION_COUNT,
  MULTIPLE_CORRECT_OPTION_LIMITS,
} from "../../../config/constants.js";
import {
  quizSchema,
  validateQuizQuestion,
} from "../../../domain/quiz/schema.js";
import type { Quiz, QuizQuestion } from "../../../domain/quiz/types.js";
import type { AgentChunkWindow } from "../../markdown/build-agent-chunk-windows.js";

export interface QuestionCandidate {
  id: string;
  prompt: string;
  type: "single" | "multiple";
  options: Array<{ id: string; label: string }>;
  correctOptionIds: string[];
}

export interface ProposeOutcome {
  accepted: QuizQuestion[];
  rejected: Array<{ index: number; issues: string[] }>;
  draftSize: number;
  targetQuestionCount: number;
  remainingSlots: number;
}

export interface FinalizeOutcome {
  success: boolean;
  quiz: Quiz | null;
  issues: string[];
}

export interface ChunkYield {
  index: number;
  totalWindows: number;
  text: string;
  done: false;
}

export interface ChunkExhausted {
  done: true;
  totalWindows: number;
}

export type ChunkResult = ChunkYield | ChunkExhausted;

export interface AgentOrchestratorState {
  readonly targetQuestionCount: number;
  readonly windowCount: number;
  getNextChunk(): ChunkResult;
  proposeQuestions(candidates: unknown[]): ProposeOutcome;
  finalizeQuiz(): FinalizeOutcome;
  getDraft(): readonly QuizQuestion[];
  getConsumedWindows(): readonly AgentChunkWindow[];
}

export interface CreateAgentOrchestratorStateOptions {
  windows: readonly AgentChunkWindow[];
  targetQuestionCount: number;
}

export function createAgentOrchestratorState(
  options: CreateAgentOrchestratorStateOptions,
): AgentOrchestratorState {
  const targetQuestionCount = validateTargetQuestionCount(
    options.targetQuestionCount,
  );
  const windows = [...options.windows];

  if (windows.length === 0) {
    throw new Error(
      "createAgentOrchestratorState requires at least one chunk window",
    );
  }

  let cursor = 0;
  const draft: QuizQuestion[] = [];
  const seenIds = new Set<string>();
  const seenPromptHashes = new Set<string>();

  return {
    targetQuestionCount,
    windowCount: windows.length,

    getNextChunk(): ChunkResult {
      if (cursor >= windows.length) {
        return { done: true, totalWindows: windows.length };
      }
      const window = windows[cursor];
      cursor += 1;
      if (!window) {
        return { done: true, totalWindows: windows.length };
      }
      return {
        done: false,
        index: window.index,
        totalWindows: windows.length,
        text: window.text,
      };
    },

    proposeQuestions(candidates: unknown[]): ProposeOutcome {
      const accepted: QuizQuestion[] = [];
      const rejected: Array<{ index: number; issues: string[] }> = [];

      candidates.forEach((candidate, index) => {
        if (draft.length >= targetQuestionCount) {
          rejected.push({
            index,
            issues: [
              `question: draft already holds ${targetQuestionCount} questions; no more accepted`,
            ],
          });
          return;
        }

        const result = validateQuizQuestion(candidate);
        if (!result.success) {
          rejected.push({ index, issues: result.issues });
          return;
        }

        const question = candidate as QuizQuestion;

        if (seenIds.has(question.id)) {
          rejected.push({
            index,
            issues: [`id: duplicate question id "${question.id}"`],
          });
          return;
        }

        const promptHash = normalizePromptHash(question.prompt);
        if (seenPromptHashes.has(promptHash)) {
          rejected.push({
            index,
            issues: [
              `prompt: duplicate prompt text "${question.prompt.slice(0, 60)}"`,
            ],
          });
          return;
        }

        draft.push(question);
        seenIds.add(question.id);
        seenPromptHashes.add(promptHash);
        accepted.push(question);
      });

      return {
        accepted,
        rejected,
        draftSize: draft.length,
        targetQuestionCount,
        remainingSlots: Math.max(0, targetQuestionCount - draft.length),
      };
    },

    finalizeQuiz(): FinalizeOutcome {
      if (draft.length < QUIZ_QUESTION_LIMITS.min) {
        return {
          success: false,
          quiz: null,
          issues: [
            `questions: must contain between ${QUIZ_QUESTION_LIMITS.min} and ${QUIZ_QUESTION_LIMITS.max} questions (draft has ${draft.length})`,
          ],
        };
      }

      const parsed = quizSchema.safeParse({ questions: draft });
      if (!parsed.success) {
        return {
          success: false,
          quiz: null,
          issues: parsed.error.issues.map(
            (issue) => `${issue.path.join(".") || "quiz"}: ${issue.message}`,
          ),
        };
      }

      return { success: true, quiz: parsed.data, issues: [] };
    },

    getDraft(): readonly QuizQuestion[] {
      return draft;
    },

    getConsumedWindows(): readonly AgentChunkWindow[] {
      return windows.slice(0, cursor);
    },
  };
}

function validateTargetQuestionCount(value: number): number {
  if (
    !Number.isInteger(value) ||
    value < QUIZ_QUESTION_LIMITS.min ||
    value > QUIZ_QUESTION_LIMITS.max
  ) {
    throw new Error(
      `targetQuestionCount must be an integer between ${QUIZ_QUESTION_LIMITS.min} and ${QUIZ_QUESTION_LIMITS.max}`,
    );
  }
  return value;
}

function normalizePromptHash(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, " ");
}

// Re-export limits so tools.ts can use them for input schema hints without
// pulling config directly.
export const AGENT_QUESTION_CONSTRAINTS = Object.freeze({
  optionCount: QUIZ_OPTION_COUNT,
  minCorrectOptionsMultiple: MULTIPLE_CORRECT_OPTION_LIMITS.min,
  maxCorrectOptionsMultiple: MULTIPLE_CORRECT_OPTION_LIMITS.max,
});
