import { tool } from "langchain";
import { z } from "zod";

import {
  nonEmptyTextSchema,
  questionTypeSchema,
  stableIdSchema,
} from "../../../domain/quiz/schema.js";
import type { Logger } from "../../logger.js";
import { createNoopLogger } from "../../logger.js";
import type { AgentOrchestratorState } from "./agent-state.js";

const questionCandidateSchema = z.strictObject({
  id: stableIdSchema,
  prompt: nonEmptyTextSchema,
  type: questionTypeSchema,
  options: z.array(
    z.strictObject({
      id: stableIdSchema,
      label: nonEmptyTextSchema,
    }),
  ),
  correctOptionIds: z.array(stableIdSchema),
});

const getNextChunkInputSchema = z.strictObject({});
const proposeQuestionsInputSchema = z.strictObject({
  questions: z.array(questionCandidateSchema.or(z.unknown())),
});
const finalizeQuizInputSchema = z.strictObject({});

export function createAgentTools(
  state: AgentOrchestratorState,
  logger: Logger = createNoopLogger(),
) {
  return [
    tool(
      async () => {
        const result = state.getNextChunk();

        logger.info("quiz_generation_agent_tool_get_next_chunk", {
          done: result.done,
          ...(result.done
            ? { totalWindows: result.totalWindows }
            : {
                chunkIndex: result.index,
                chunkCharacters: result.text.length,
                totalWindows: result.totalWindows,
              }),
        });

        return result;
      },
      {
        name: "get_next_chunk",
        description:
          "Return the next unread source chunk window in original order.",
        schema: getNextChunkInputSchema,
      },
    ),
    tool(
      async ({ questions }) => {
        logger.info("quiz_generation_agent_tool_propose_questions_started", {
          candidateCount: questions.length,
        });

        const outcome = state.proposeQuestions(questions);

        logger.info("quiz_generation_agent_tool_propose_questions_completed", {
          acceptedCount: outcome.accepted.length,
          draftSize: outcome.draftSize,
          rejectedCount: outcome.rejected.length,
          remainingSlots: outcome.remainingSlots,
        });

        return outcome;
      },
      {
        name: "propose_questions",
        description:
          "Propose one or more quiz questions to append to the running draft.",
        schema: proposeQuestionsInputSchema,
      },
    ),
    tool(
      async () => {
        const outcome = state.finalizeQuiz();

        logger.info("quiz_generation_agent_tool_finalize_quiz", {
          draftSize: state.getDraft().length,
          issueCount: outcome.issues.length,
          success: outcome.success,
        });

        return outcome;
      },
      {
        name: "finalize_quiz",
        description:
          "Finalize the current quiz draft and return schema issues if it is invalid.",
        schema: finalizeQuizInputSchema,
      },
    ),
  ] as const;
}
