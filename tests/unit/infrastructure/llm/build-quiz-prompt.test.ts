import { describe, expect, it } from "vitest";

import { FETCH_LIMITS } from "../../../../src/config/constants.js";
import { buildQuizPrompt } from "../../../../src/infrastructure/llm/build-quiz-prompt.js";
import { QuizGenerationInputError } from "../../../../src/infrastructure/llm/errors.js";
import type { MarkdownSource } from "../../../../src/infrastructure/markdown/fetch-markdown.js";

function createMarkdownSource(
  overrides: Partial<MarkdownSource> = {},
): MarkdownSource {
  const markdown =
    overrides.markdown ??
    "# Source Title\n\nImportant fact.\n\n## Details\n\nSecond fact.";

  return {
    chunkCount: 1,
    markdown,
    normalizedUrl: "https://example.com/source.md",
    originalCharacters: markdown.length,
    originalUrl: "https://example.com/source.md",
    retainedCharacters: markdown.length,
    title: "Source Title",
    wasTruncated: false,
    ...overrides,
  };
}

describe("buildQuizPrompt", () => {
  it("preserves bounded source content and explicit quiz constraints", () => {
    const prompt = buildQuizPrompt({
      questionCount: 6,
      source: createMarkdownSource(),
    });

    expect(prompt).toContain("Generate exactly 6 questions.");
    expect(prompt).toContain("Each question must have exactly 4 options.");
    expect(prompt).toContain("Use only the supplied source content.");
    expect(prompt).toContain("Title: Source Title");
    expect(prompt).toContain("URL: https://example.com/source.md");
    expect(prompt).toContain("# Source Title\n\nImportant fact.");
  });

  it("rejects source markdown that exceeds the bounded prompt cap", () => {
    const oversizedMarkdown =
      "# Large\n\n" + "A".repeat(FETCH_LIMITS.promptCharCap + 1);

    expect(() =>
      buildQuizPrompt({
        source: createMarkdownSource({
          markdown: oversizedMarkdown,
          originalCharacters: oversizedMarkdown.length,
          retainedCharacters: oversizedMarkdown.length,
        }),
      }),
    ).toThrow(QuizGenerationInputError);
  });
});
