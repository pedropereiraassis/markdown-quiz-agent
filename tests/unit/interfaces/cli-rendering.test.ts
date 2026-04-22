import { describe, expect, it } from "vitest";

import { RunQuizSessionError } from "../../../src/application/errors.js";
import { QuizGenerationProviderError } from "../../../src/infrastructure/llm/errors.js";
import { MarkdownIngestionError } from "../../../src/infrastructure/markdown/fetch-markdown.js";
import { formatCliError } from "../../../src/interfaces/cli/main.js";
import {
  renderPreparedSourceSummary,
  renderResults,
} from "../../../src/interfaces/cli/render-results.js";

describe("CLI rendering", () => {
  it("shows per-question points and the final numeric score without formulas", () => {
    const lines = renderResults({
      createdAt: "2026-04-21T12:00:00.000Z",
      finalScore: 2.561234,
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
          prompt: "Question 1",
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
          pointsAwarded: 8 / 3,
          prompt: "Question 2",
          questionId: "q2",
          questionOrder: 2,
          questionType: "multiple",
          selectedOptionIds: ["q2-a", "q2-b"],
          weightApplied: 1.1,
        },
      ],
      sessionId: "session-123",
      sourceTitle: "Guide",
      sourceUrl: "https://example.com/guide.md",
      totalQuestionCount: 2,
    });

    expect(lines).toEqual(
      expect.arrayContaining([
        "Question 1: 4.00 points",
        "  Selected: Option A",
        "  Correct: Option A",
        "Question 2: 2.67 points",
        "  Selected: Option A | Option B",
        "  Correct: Option A | Option C",
        "Final score: 2.56 / 4.00",
        "Scoring notes: Multiple-answer questions can earn partial credit based on how many correct options you selected.",
      ]),
    );
    expect(lines.join("\n")).not.toContain("clamp");
    expect(lines.join("\n")).not.toContain("4 *");
    expect(lines.join("\n")).not.toContain("weight_");
  });

  it("renders compact source metadata without preview text", () => {
    const lines = renderPreparedSourceSummary({
      sourceTitle: "Guide",
      wasSourceTruncated: true,
    });

    expect(lines).toEqual([
      "Source: Guide",
      "The source was trimmed to fit the quiz context.",
    ]);
    expect(lines.join("\n")).not.toContain("## ");
  });

  it("formats user-facing errors without stack traces", () => {
    const error = new RunQuizSessionError({
      cause: new Error("socket hang up"),
      code: "source_unavailable",
      message: "Could not load bounded Markdown from the source URL",
      stage: "prepare",
    });

    const formatted = formatCliError(error);

    expect(formatted).toBe(
      "The Markdown source could not be loaded. Check the URL and try again.",
    );
    expect(formatted).not.toContain("socket hang up");
    expect(formatted).not.toContain("at ");
  });

  it("surfaces bounded source timeout details without leaking a stack trace", () => {
    const error = new RunQuizSessionError({
      cause: new MarkdownIngestionError({
        code: "timeout",
        message: "Source request exceeded the 10000 ms timeout",
        url: "https://example.com/slow.md",
      }),
      code: "source_unavailable",
      message: "Could not load bounded Markdown from the source URL",
      stage: "prepare",
    });

    expect(formatCliError(error)).toBe(
      "The Markdown source timed out after 10000 ms. Try again or use a faster URL.",
    );
  });

  it("surfaces OpenRouter routing failures instead of the generic quiz message", () => {
    const error = new RunQuizSessionError({
      cause: new QuizGenerationProviderError(
        "OpenRouter quiz generation failed before a valid response was returned",
        1,
        new Error(
          "No endpoints found that can handle the requested parameters. To learn more about provider routing, visit: https://openrouter.ai/docs/guides/routing/provider-selection",
        ),
      ),
      code: "quiz_generation_failed",
      message:
        "Could not generate a valid quiz from the bounded source Markdown",
      stage: "prepare",
    });

    expect(formatCliError(error)).toBe(
      "The configured OpenRouter model cannot handle the required quiz-generation parameters.",
    );
  });
});
