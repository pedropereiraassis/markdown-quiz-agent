import { describe, expect, it } from "vitest";

import {
  getQuestionWeight,
  getQuestionWeights,
  roundScoreForDisplay,
  scoreMultipleAnswerQuestion,
  scoreQuiz,
  scoreSingleAnswerQuestion,
} from "../../../src/domain/scoring/score-quiz.js";
import { createAnswers, createQuiz } from "../../support/quiz-fixtures.js";

describe("scoring", () => {
  it("awards 4 points for an exact single-answer match and 0 otherwise", () => {
    expect(scoreSingleAnswerQuestion("q1-a", ["q1-a"])).toBe(4);
    expect(scoreSingleAnswerQuestion("q1-a", ["q1-b"])).toBe(0);
    expect(scoreSingleAnswerQuestion("q1-a", ["q1-a", "q1-b"])).toBe(0);
  });

  it("awards partial credit for multiple-answer questions based on correct selections only", () => {
    expect(scoreMultipleAnswerQuestion(["q2-a", "q2-b"], ["q2-a"])).toBe(2);
    expect(
      scoreMultipleAnswerQuestion(["q2-a", "q2-b"], ["q2-a", "q2-c"]),
    ).toBe(2);
    expect(
      scoreMultipleAnswerQuestion(["q2-a", "q2-b", "q2-c"], ["q2-a", "q2-b"]),
    ).toBe(8 / 3);
  });

  it("ignores wrong extra selections when counting multiple-answer credit", () => {
    expect(
      scoreMultipleAnswerQuestion(
        ["q2-a", "q2-b", "q2-c"],
        ["q2-d", "q2-e", "q2-a"],
      ),
    ).toBe(4 / 3);
    expect(
      scoreMultipleAnswerQuestion(
        ["q2-a", "q2-b"],
        ["q2-a", "q2-b", "q2-c", "q2-d"],
      ),
    ).toBe(4);
  });

  it("uses 1.0, 1.1, 1.21, and later weights for the weighted final score", () => {
    expect(getQuestionWeight(1)).toBe(1);
    expect(getQuestionWeight(2)).toBeCloseTo(1.1);
    expect(getQuestionWeight(3)).toBeCloseTo(1.21);
    expect(getQuestionWeights(4)).toEqual([
      1, 1.1, 1.2100000000000002, 1.3310000000000004,
    ]);
  });

  it("calculates the weighted final score without presentation rounding", () => {
    const quiz = createQuiz();
    const result = scoreQuiz(
      quiz,
      createAnswers({
        q1: ["q1-a"],
        q2: ["q2-a"],
        q3: ["q3-c"],
        q4: ["q4-a", "q4-c"],
        q5: ["q5-d"],
      }),
    );

    expect(result.questionResults.map((entry) => entry.pointsAwarded)).toEqual([
      4,
      2,
      0,
      8 / 3,
      4,
    ]);

    const expectedFinalScore =
      (4 * 1 +
        2 * 1.1 +
        0 * 1.21 +
        (8 / 3) * 1.3310000000000004 +
        4 * 1.4641000000000006) /
      (1 + 1.1 + 1.21 + 1.3310000000000004 + 1.4641000000000006);

    expect(result.finalScore).toBeCloseTo(expectedFinalScore);
    expect(roundScoreForDisplay(result.finalScore)).toBe(2.56);
  });
});
