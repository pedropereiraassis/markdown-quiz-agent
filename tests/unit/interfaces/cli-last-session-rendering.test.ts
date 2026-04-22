import { describe, expect, it } from "vitest";

import type { SavedQuizSession } from "../../../src/application/read-last-session.js";
import {
  renderLastSession,
  renderNoSavedSessions,
  renderSavedSessionList,
} from "../../../src/interfaces/cli/render-last-session.js";

function createSavedSession(
  overrides: Partial<SavedQuizSession> = {},
): SavedQuizSession {
  return {
    sessionId: "session-123",
    sourceUrl: "https://example.com/guide.md",
    normalizedSourceUrl: "https://example.com/guide.md",
    sourceTitle: "Guide",
    totalQuestionCount: 2,
    finalScore: 3.257,
    createdAt: "2026-04-22T12:00:00.000Z",
    answers: [
      {
        questionId: "q1",
        questionOrder: 1,
        questionType: "single",
        questionText: "Prompt for q1",
        options: [
          { id: "q1-a", label: "Option A for q1" },
          { id: "q1-b", label: "Option B for q1" },
          { id: "q1-c", label: "Option C for q1" },
          { id: "q1-d", label: "Option D for q1" },
        ],
        correctOptionIds: ["q1-a"],
        selectedOptionIds: ["q1-b"],
        pointsAwarded: 0,
        weightApplied: 1,
      },
      {
        questionId: "q2",
        questionOrder: 2,
        questionType: "multiple",
        questionText: "Prompt for q2",
        options: [
          { id: "q2-a", label: "Option A for q2" },
          { id: "q2-b", label: "Option B for q2" },
          { id: "q2-c", label: "Option C for q2" },
          { id: "q2-d", label: "Option D for q2" },
        ],
        correctOptionIds: ["q2-a", "q2-d"],
        selectedOptionIds: [],
        pointsAwarded: 2,
        weightApplied: 1.1,
      },
    ],
    ...overrides,
  };
}

describe("last-session rendering", () => {
  it("renders saved session metadata and answer details in plain text", () => {
    const lines = renderLastSession(createSavedSession());

    expect(lines).toEqual([
      "Session id: session-123",
      "Saved at:   2026-04-22T12:00:00.000Z",
      "Source:     Guide",
      "URL:        https://example.com/guide.md",
      "Final score: 3.26 / 4.00 (2 questions)",
      "",
      [
        "Q1 [single] Prompt for q1",
        "  correct:  Option A for q1",
        "  selected: Option B for q1",
        "  points:   0 / 4.00 (weight 1)",
        "",
      ].join("\n"),
      [
        "Q2 [multiple] Prompt for q2",
        "  correct:  Option A for q2 | Option D for q2",
        "  selected: (no answer)",
        "  points:   2 / 4.00 (weight 1.1)",
        "",
      ].join("\n"),
    ]);
  });

  it("falls back to the normalized URL when the session has no source title", () => {
    const lines = renderLastSession(createSavedSession({ sourceTitle: null }));

    expect(lines[2]).toBe("Source:     https://example.com/guide.md");
  });

  it("falls back to raw option ids when a saved snapshot references unknown ids", () => {
    const lines = renderLastSession(
      createSavedSession({
        answers: [
          {
            questionId: "q3",
            questionOrder: 3,
            questionType: "multiple",
            questionText: "Prompt for q3",
            options: [
              { id: "q3-a", label: "Option A for q3" },
              { id: "q3-b", label: "Option B for q3" },
              { id: "q3-c", label: "Option C for q3" },
              { id: "q3-d", label: "Option D for q3" },
            ],
            correctOptionIds: ["q3-a", "q3-x"],
            selectedOptionIds: ["q3-y"],
            pointsAwarded: 2,
            weightApplied: 1.331,
          },
        ],
      }),
    );

    expect(lines[6]).toContain("correct:  Option A for q3 | q3-x");
    expect(lines[6]).toContain("selected: q3-y");
  });

  it("renders the empty-state helper message", () => {
    expect(renderNoSavedSessions()).toBe(
      "No quiz sessions have been saved yet. Run `npm run cli` first.",
    );
  });

  it("renders a compact saved-session list for the list command", () => {
    expect(
      renderSavedSessionList([
        {
          createdAt: "2026-04-22T13:00:00.000Z",
          finalScore: 3.5,
          normalizedSourceUrl: "https://example.com/guide.md",
          sessionId: "session-123",
          sourceTitle: "Guide",
          totalQuestionCount: 6,
        },
        {
          createdAt: "2026-04-22T12:00:00.000Z",
          finalScore: 2,
          normalizedSourceUrl: "https://example.com/reference.md",
          sessionId: "session-456",
          sourceTitle: null,
          totalQuestionCount: 5,
        },
      ]),
    ).toEqual([
      "1. 2026-04-22T13:00:00.000Z | 3.5 / 4.00 | 6 questions | Guide | session-123",
      "2. 2026-04-22T12:00:00.000Z | 2 / 4.00 | 5 questions | https://example.com/reference.md | session-456",
    ]);
  });
});
