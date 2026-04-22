import { describe, expect, it } from "vitest";

import type { Quiz } from "../../../../../src/domain/quiz/types.js";
import { validateAgentQuiz } from "../../../../../src/infrastructure/llm/agent/validate-agent-quiz.js";

const windows = [
  {
    index: 0,
    text: "# Mercury\n\nMercury is the smallest planet in the solar system.",
    characterCount: 61,
  },
];

describe("validateAgentQuiz", () => {
  it("accepts a schema-valid grounded quiz", () => {
    const quiz: Quiz = {
      questions: [
        {
          id: "q1",
          prompt: "Which planet is the smallest in the solar system?",
          type: "single",
          options: [
            { id: "q1-a", label: "Mercury" },
            { id: "q1-b", label: "Venus" },
            { id: "q1-c", label: "Earth" },
            { id: "q1-d", label: "Mars" },
          ],
          correctOptionIds: ["q1-a"],
        },
        {
          id: "q2",
          prompt: "Which planet section says Mercury is the smallest planet?",
          type: "single",
          options: [
            { id: "q2-a", label: "Mercury" },
            { id: "q2-b", label: "Jupiter" },
            { id: "q2-c", label: "Saturn" },
            { id: "q2-d", label: "Neptune" },
          ],
          correctOptionIds: ["q2-a"],
        },
        {
          id: "q3",
          prompt: "Which planet name appears in the source window heading?",
          type: "single",
          options: [
            { id: "q3-a", label: "Mercury" },
            { id: "q3-b", label: "Pluto" },
            { id: "q3-c", label: "Saturn" },
            { id: "q3-d", label: "Uranus" },
          ],
          correctOptionIds: ["q3-a"],
        },
        {
          id: "q4",
          prompt:
            "The source says Mercury is the smallest what in the solar system?",
          type: "single",
          options: [
            { id: "q4-a", label: "Planet" },
            { id: "q4-b", label: "Moon" },
            { id: "q4-c", label: "Star" },
            { id: "q4-d", label: "Comet" },
          ],
          correctOptionIds: ["q4-a"],
        },
        {
          id: "q5",
          prompt:
            "Which source word describes Mercury relative to the solar system?",
          type: "single",
          options: [
            { id: "q5-a", label: "Smallest" },
            { id: "q5-b", label: "Largest" },
            { id: "q5-c", label: "Brightest" },
            { id: "q5-d", label: "Coldest" },
          ],
          correctOptionIds: ["q5-a"],
        },
      ],
    };

    expect(validateAgentQuiz(quiz, windows)).toEqual({
      success: true,
      issues: [],
    });
  });

  it("surfaces schema issues", () => {
    const result = validateAgentQuiz({ questions: [] }, windows);

    expect(result.success).toBe(false);
    expect(result.issues.join(" ")).toMatch(/between 5 and 8/);
  });

  it("flags a prompt with no source overlap", () => {
    const quiz: Quiz = {
      questions: [
        {
          id: "q1",
          prompt: "Which galaxy is farthest from Andromeda?",
          type: "single",
          options: [
            { id: "q1-a", label: "Option A" },
            { id: "q1-b", label: "Option B" },
            { id: "q1-c", label: "Option C" },
            { id: "q1-d", label: "Option D" },
          ],
          correctOptionIds: ["q1-a"],
        },
        {
          id: "q2",
          prompt: "Which galaxy cluster is brightest?",
          type: "single",
          options: [
            { id: "q2-a", label: "Option A" },
            { id: "q2-b", label: "Option B" },
            { id: "q2-c", label: "Option C" },
            { id: "q2-d", label: "Option D" },
          ],
          correctOptionIds: ["q2-a"],
        },
        {
          id: "q3",
          prompt: "Which nebula surrounds Orion?",
          type: "single",
          options: [
            { id: "q3-a", label: "Option A" },
            { id: "q3-b", label: "Option B" },
            { id: "q3-c", label: "Option C" },
            { id: "q3-d", label: "Option D" },
          ],
          correctOptionIds: ["q3-a"],
        },
        {
          id: "q4",
          prompt: "Which telescope found the pulsar?",
          type: "single",
          options: [
            { id: "q4-a", label: "Option A" },
            { id: "q4-b", label: "Option B" },
            { id: "q4-c", label: "Option C" },
            { id: "q4-d", label: "Option D" },
          ],
          correctOptionIds: ["q4-a"],
        },
        {
          id: "q5",
          prompt: "Which supernova remnant is youngest?",
          type: "single",
          options: [
            { id: "q5-a", label: "Option A" },
            { id: "q5-b", label: "Option B" },
            { id: "q5-c", label: "Option C" },
            { id: "q5-d", label: "Option D" },
          ],
          correctOptionIds: ["q5-a"],
        },
      ],
    };

    const result = validateAgentQuiz(quiz, windows);

    expect(result.success).toBe(false);
    expect(result.issues[0]).toMatch(/does not overlap/);
  });
});
