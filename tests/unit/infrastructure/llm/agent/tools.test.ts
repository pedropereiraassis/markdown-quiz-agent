import { describe, expect, it, vi } from "vitest";

import { createSingleQuestion } from "../../../../support/quiz-fixtures.js";
import { createAgentTools } from "../../../../../src/infrastructure/llm/agent/tools.js";
import type { AgentOrchestratorState } from "../../../../../src/infrastructure/llm/agent/agent-state.js";
import type { Logger } from "../../../../../src/infrastructure/logger.js";

function createStateStub(): AgentOrchestratorState {
  return {
    targetQuestionCount: 5,
    windowCount: 1,
    getNextChunk: vi.fn(() => ({
      done: false as const,
      index: 0,
      totalWindows: 1,
      text: "# Section\n\nContent.",
    })),
    proposeQuestions: vi.fn(() => ({
      accepted: [],
      rejected: [],
      draftSize: 0,
      targetQuestionCount: 5,
      remainingSlots: 5,
    })),
    finalizeQuiz: vi.fn(() => ({
      success: false,
      quiz: null,
      issues: ["questions: not enough questions"],
    })),
    getDraft: vi.fn(() => []),
    getConsumedWindows: vi.fn(() => []),
  };
}

function createLoggerStub(): Logger {
  return {
    error: vi.fn(),
    info: vi.fn(),
  };
}

describe("createAgentTools", () => {
  it("delegates get_next_chunk to the orchestrator state", async () => {
    const state = createStateStub();
    const logger = createLoggerStub();
    const [getNextChunkTool] = createAgentTools(state, logger);

    await expect(getNextChunkTool.invoke({})).resolves.toEqual({
      done: false,
      index: 0,
      totalWindows: 1,
      text: "# Section\n\nContent.",
    });
    expect(state.getNextChunk).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(
      "quiz_generation_agent_tool_get_next_chunk",
      {
        chunkCharacters: "# Section\n\nContent.".length,
        chunkIndex: 0,
        done: false,
        totalWindows: 1,
      },
    );
  });

  it("delegates propose_questions with validated args", async () => {
    const state = createStateStub();
    const logger = createLoggerStub();
    const [, proposeQuestionsTool] = createAgentTools(state, logger);
    const candidate = createSingleQuestion("q1");

    await proposeQuestionsTool.invoke({ questions: [candidate] });

    expect(state.proposeQuestions).toHaveBeenCalledWith([candidate]);
    expect(logger.info).toHaveBeenCalledWith(
      "quiz_generation_agent_tool_propose_questions_started",
      {
        candidateCount: 1,
      },
    );
    expect(logger.info).toHaveBeenCalledWith(
      "quiz_generation_agent_tool_propose_questions_completed",
      {
        acceptedCount: 0,
        draftSize: 0,
        rejectedCount: 0,
        remainingSlots: 5,
      },
    );
  });

  it("rejects malformed top-level propose_questions args", async () => {
    const state = createStateStub();
    const [, proposeQuestionsTool] = createAgentTools(state);

    await expect(
      proposeQuestionsTool.invoke({
        questions: "not-an-array",
      } as never),
    ).rejects.toThrow();

    expect(state.proposeQuestions).not.toHaveBeenCalled();
  });

  it("delegates finalize_quiz to the orchestrator state", async () => {
    const state = createStateStub();
    const logger = createLoggerStub();
    const [, , finalizeQuizTool] = createAgentTools(state, logger);

    await expect(finalizeQuizTool.invoke({})).resolves.toEqual({
      success: false,
      quiz: null,
      issues: ["questions: not enough questions"],
    });
    expect(state.finalizeQuiz).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(
      "quiz_generation_agent_tool_finalize_quiz",
      {
        draftSize: 0,
        issueCount: 1,
        success: false,
      },
    );
  });

  it("rejects unexpected input keys for zero-argument tools", async () => {
    const state = createStateStub();
    const [getNextChunkTool, , finalizeQuizTool] = createAgentTools(state);

    await expect(
      getNextChunkTool.invoke({ extra: true } as never),
    ).rejects.toThrow();
    await expect(
      finalizeQuizTool.invoke({ extra: true } as never),
    ).rejects.toThrow();
  });
});
