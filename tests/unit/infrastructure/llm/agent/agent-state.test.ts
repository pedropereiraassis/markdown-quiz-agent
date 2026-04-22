import { describe, expect, it } from "vitest";

import { createAgentOrchestratorState } from "../../../../../src/infrastructure/llm/agent/agent-state.js";
import { createSingleQuestion } from "../../../../support/quiz-fixtures.js";

function makeWindows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    index,
    text: `# Section ${index}\n\nContent ${index}.`,
    characterCount: `# Section ${index}\n\nContent ${index}.`.length,
  }));
}

describe("createAgentOrchestratorState", () => {
  it("rejects zero windows", () => {
    expect(() =>
      createAgentOrchestratorState({ windows: [], targetQuestionCount: 5 }),
    ).toThrow(/at least one chunk window/);
  });

  it("rejects out-of-range targetQuestionCount", () => {
    expect(() =>
      createAgentOrchestratorState({
        windows: makeWindows(1),
        targetQuestionCount: 4,
      }),
    ).toThrow(/between 5 and 8/);
    expect(() =>
      createAgentOrchestratorState({
        windows: makeWindows(1),
        targetQuestionCount: 9,
      }),
    ).toThrow(/between 5 and 8/);
  });

  it("yields chunks in order then returns done", () => {
    const state = createAgentOrchestratorState({
      windows: makeWindows(2),
      targetQuestionCount: 5,
    });

    const first = state.getNextChunk();
    expect(first.done).toBe(false);
    if (!first.done) {
      expect(first.index).toBe(0);
      expect(first.totalWindows).toBe(2);
    }

    const second = state.getNextChunk();
    expect(second.done).toBe(false);
    if (!second.done) expect(second.index).toBe(1);

    const third = state.getNextChunk();
    expect(third.done).toBe(true);
  });

  it("accepts valid candidates and reports remainingSlots", () => {
    const state = createAgentOrchestratorState({
      windows: makeWindows(1),
      targetQuestionCount: 5,
    });

    const outcome = state.proposeQuestions([
      createSingleQuestion("q1"),
      createSingleQuestion("q2"),
    ]);

    expect(outcome.accepted).toHaveLength(2);
    expect(outcome.draftSize).toBe(2);
    expect(outcome.remainingSlots).toBe(3);
    expect(outcome.rejected).toHaveLength(0);
  });

  it("rejects duplicate ids and duplicate prompt text", () => {
    const state = createAgentOrchestratorState({
      windows: makeWindows(1),
      targetQuestionCount: 5,
    });

    state.proposeQuestions([createSingleQuestion("q1")]);
    const outcome = state.proposeQuestions([
      createSingleQuestion("q1"),
      {
        ...createSingleQuestion("q2"),
        prompt: " prompt for q1 ", // duplicate prompt by normalized hash
      },
    ]);

    expect(outcome.accepted).toHaveLength(0);
    expect(outcome.rejected).toHaveLength(2);
    expect(outcome.rejected[0]?.issues.join(" ")).toMatch(
      /duplicate question id/,
    );
    expect(outcome.rejected[1]?.issues.join(" ")).toMatch(/duplicate prompt/);
  });

  it("rejects malformed candidates with schema issues", () => {
    const state = createAgentOrchestratorState({
      windows: makeWindows(1),
      targetQuestionCount: 5,
    });

    const outcome = state.proposeQuestions([
      { id: "q1", prompt: "missing options" },
    ]);

    expect(outcome.accepted).toHaveLength(0);
    expect(outcome.rejected[0]?.issues.length).toBeGreaterThan(0);
  });

  it("refuses extra questions once target is reached", () => {
    const state = createAgentOrchestratorState({
      windows: makeWindows(1),
      targetQuestionCount: 5,
    });

    state.proposeQuestions(
      [1, 2, 3, 4, 5].map((i) => createSingleQuestion(`q${i}`)),
    );
    const outcome = state.proposeQuestions([createSingleQuestion("q6")]);
    expect(outcome.rejected[0]?.issues.join(" ")).toMatch(/no more accepted/);
  });

  it("finalize returns schema issues when draft too small", () => {
    const state = createAgentOrchestratorState({
      windows: makeWindows(1),
      targetQuestionCount: 5,
    });

    state.proposeQuestions([
      createSingleQuestion("q1"),
      createSingleQuestion("q2"),
    ]);

    const outcome = state.finalizeQuiz();
    expect(outcome.success).toBe(false);
    expect(outcome.issues.join(" ")).toMatch(/between 5 and 8 questions/);
  });

  it("finalize succeeds when 5 valid questions are drafted", () => {
    const state = createAgentOrchestratorState({
      windows: makeWindows(1),
      targetQuestionCount: 5,
    });

    state.proposeQuestions(
      [1, 2, 3, 4, 5].map((i) => createSingleQuestion(`q${i}`)),
    );

    const outcome = state.finalizeQuiz();
    expect(outcome.success).toBe(true);
    expect(outcome.quiz?.questions).toHaveLength(5);
  });
});
