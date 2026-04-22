import { describe, expect, it, vi } from "vitest";

import { RunQuizSessionError } from "../../src/application/errors.js";
import type {
  CompletedQuizSession,
  PreparedQuizQuestion,
  RunQuizSession,
} from "../../src/application/run-quiz-session.js";
import {
  runCli,
  type CliOutput,
  type CliProgress,
} from "../../src/interfaces/cli/main.js";

interface CapturedOutput {
  kind: string;
  message: string;
}

function createPreparedQuestions(): PreparedQuizQuestion[] {
  return [
    {
      id: "q1",
      options: [
        { id: "q1-a", label: "Option A" },
        { id: "q1-b", label: "Option B" },
        { id: "q1-c", label: "Option C" },
        { id: "q1-d", label: "Option D" },
      ],
      prompt: "First question prompt",
      type: "single",
    },
    {
      id: "q2",
      options: [
        { id: "q2-a", label: "Option A" },
        { id: "q2-b", label: "Option B" },
        { id: "q2-c", label: "Option C" },
        { id: "q2-d", label: "Option D" },
      ],
      prompt: "Second question prompt",
      type: "multiple",
    },
  ];
}

function createCompletedSession(): CompletedQuizSession {
  return {
    createdAt: "2026-04-21T12:00:00.000Z",
    finalScore: 3.25,
    normalizedSourceUrl: "https://example.com/guide.md",
    questionResults: [
      {
        correctOptionIds: ["q1-a"],
        options: [
          { id: "q1-a", label: "Option A" },
          { id: "q1-b", label: "Option B" },
          { id: "q1-c", label: "Option C" },
          { id: "q1-d", label: "Option D" },
        ],
        pointsAwarded: 4,
        prompt: "First question prompt",
        questionId: "q1",
        questionOrder: 1,
        questionType: "single",
        selectedOptionIds: ["q1-a"],
        weightApplied: 1,
      },
      {
        correctOptionIds: ["q2-a", "q2-c"],
        options: [
          { id: "q2-a", label: "Option A" },
          { id: "q2-b", label: "Option B" },
          { id: "q2-c", label: "Option C" },
          { id: "q2-d", label: "Option D" },
        ],
        pointsAwarded: 2,
        prompt: "Second question prompt",
        questionId: "q2",
        questionOrder: 2,
        questionType: "multiple",
        selectedOptionIds: ["q2-a"],
        weightApplied: 1.1,
      },
    ],
    sessionId: "session-123",
    sourceTitle: "Guide",
    sourceUrl: "https://example.com/guide.md",
    totalQuestionCount: 2,
  };
}

function createOutputCapture() {
  const outputs: CapturedOutput[] = [];
  const output: CliOutput = {
    cancel: (message) => outputs.push({ kind: "cancel", message }),
    error: (message) => outputs.push({ kind: "error", message }),
    info: (message) => outputs.push({ kind: "info", message }),
    intro: (message) => outputs.push({ kind: "intro", message }),
    outro: (message) => outputs.push({ kind: "outro", message }),
    progress: (message) => {
      outputs.push({ kind: "progress", message });

      return {
        error: (progressMessage) =>
          outputs.push({ kind: "progress-error", message: progressMessage }),
        success: (progressMessage) =>
          outputs.push({ kind: "progress-success", message: progressMessage }),
      } satisfies CliProgress;
    },
    step: (message) => outputs.push({ kind: "step", message }),
    success: (message) => outputs.push({ kind: "success", message }),
  };

  return { output, outputs };
}

describe("CLI flow integration", () => {
  it("runs from source URL intake through results and save confirmation with stubbed interaction points", async () => {
    const preparedQuestions = createPreparedQuestions();
    const completedSession = createCompletedSession();
    const prepare = vi.fn().mockResolvedValue({
      normalizedSourceUrl: "https://example.com/guide.md",
      questionCount: preparedQuestions.length,
      questions: preparedQuestions,
      sessionToken: "prepared-token",
      sourceTitle: "Guide",
      sourceUrl: "https://example.com/guide.md",
      wasSourceTruncated: false,
    });
    const complete = vi.fn().mockResolvedValue(completedSession);
    const promptText = vi
      .fn()
      .mockResolvedValue("https://example.com/guide.md");
    const promptSelect = vi.fn().mockResolvedValue("q1-a");
    const promptMultiSelect = vi.fn().mockResolvedValue(["q2-a"]);
    const { output, outputs } = createOutputCapture();

    const exitCode = await runCli({
      output,
      promptApi: {
        promptMultiSelect,
        promptSelect,
        promptText,
      },
      runQuizSession: {
        complete,
        prepare,
      } satisfies RunQuizSession,
    });

    expect(exitCode).toBe(0);
    expect(prepare).toHaveBeenCalledWith("https://example.com/guide.md");
    expect(complete).toHaveBeenCalledWith({
      answers: [
        { questionId: "q1", selectedOptionIds: ["q1-a"] },
        { questionId: "q2", selectedOptionIds: ["q2-a"] },
      ],
      sessionToken: "prepared-token",
    });
    expect(promptMultiSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Multiple-answer question"),
      }),
    );
    expect(outputs).toEqual(
      expect.arrayContaining([
        { kind: "intro", message: "Markdown Quiz" },
        { kind: "progress-success", message: "Prepared 2 questions." },
        { kind: "info", message: "Source: Guide" },
        { kind: "progress-success", message: "Quiz scored and session saved." },
        { kind: "info", message: "Question 1: 4.00 points" },
        { kind: "info", message: "Final score: 3.25 / 4.00" },
        { kind: "outro", message: "Session saved as session-123." },
      ]),
    );
  });

  it("does not display source previews before the quiz begins", async () => {
    const previewText = "## Hidden Source Preview";
    const preparedQuestions = createPreparedQuestions();
    const { output, outputs } = createOutputCapture();

    await runCli({
      output,
      promptApi: {
        promptMultiSelect: vi.fn().mockResolvedValue(["q2-a"]),
        promptSelect: vi.fn().mockResolvedValue("q1-a"),
        promptText: vi.fn().mockResolvedValue("https://example.com/guide.md"),
      },
      runQuizSession: {
        complete: vi.fn().mockResolvedValue(createCompletedSession()),
        prepare: vi.fn().mockResolvedValue({
          normalizedSourceUrl: "https://example.com/guide.md",
          questionCount: preparedQuestions.length,
          questions: preparedQuestions,
          sessionToken: "prepared-token",
          sourceTitle: "Guide",
          sourceUrl: "https://example.com/guide.md",
          wasSourceTruncated: false,
        }),
      } satisfies RunQuizSession,
    });

    const firstQuestionPromptMessage = "Question 1 of 2";
    const messagesBeforeQuestions = outputs
      .map((entry) => entry.message)
      .filter((message) => message !== firstQuestionPromptMessage);

    expect(messagesBeforeQuestions.join("\n")).not.toContain(previewText);
  });

  it("retries after a recoverable prepare failure and completes in one CLI run", async () => {
    const prepare = vi
      .fn()
      .mockRejectedValueOnce(
        new RunQuizSessionError({
          code: "source_unavailable",
          message: "Could not load bounded Markdown from the source URL",
          stage: "prepare",
        }),
      )
      .mockResolvedValueOnce({
        normalizedSourceUrl: "https://example.com/guide.md",
        questionCount: createPreparedQuestions().length,
        questions: createPreparedQuestions(),
        sessionToken: "prepared-token",
        sourceTitle: "Guide",
        sourceUrl: "https://example.com/guide.md",
        wasSourceTruncated: false,
      });
    const complete = vi.fn().mockResolvedValue(createCompletedSession());
    const { output, outputs } = createOutputCapture();

    const exitCode = await runCli({
      output,
      promptApi: {
        promptMultiSelect: vi.fn().mockResolvedValue(["q2-a"]),
        promptSelect: vi.fn().mockResolvedValue("q1-a"),
        promptText: vi
          .fn()
          .mockResolvedValueOnce("https://example.com/missing.md")
          .mockResolvedValueOnce("https://example.com/guide.md"),
      },
      runQuizSession: {
        complete,
        prepare,
      } satisfies RunQuizSession,
    });

    expect(exitCode).toBe(0);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(outputs).toContainEqual({
      kind: "progress-error",
      message:
        "The Markdown source could not be loaded. Check the URL and try again.",
    });
    expect(outputs).toContainEqual({
      kind: "info",
      message: "Paste another Markdown URL to try another source.",
    });
    expect(outputs).toContainEqual({
      kind: "progress-success",
      message: "Prepared 2 questions.",
    });
  });
});
