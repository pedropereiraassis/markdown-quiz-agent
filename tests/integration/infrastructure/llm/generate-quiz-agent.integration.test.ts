import { describe, expect, it, vi } from "vitest";

import { FETCH_LIMITS } from "../../../../src/config/constants.js";
import { createOpenRouterAgentQuizGenerator } from "../../../../src/infrastructure/llm/agent/generate-quiz-agent.js";
import type { MarkdownSource } from "../../../../src/infrastructure/markdown/fetch-markdown.js";

function createLargeMarkdownSource(): MarkdownSource {
  const filler = "Mercury is rocky.\n\n".repeat(1_400);
  const fullMarkdown = [
    "# Mercury",
    "",
    filler,
    "# Tail Marker",
    "",
    "Venus is the hottest planet.",
  ].join("\n");
  const markdown = fullMarkdown.slice(0, FETCH_LIMITS.promptCharCap);

  return {
    chunkCount: 12,
    fullMarkdown,
    markdown,
    normalizedUrl: "https://example.com/large.md",
    originalCharacters: fullMarkdown.length,
    originalUrl: "https://example.com/large.md",
    retainedCharacters: markdown.length,
    title: "Large Source",
    wasTruncated: true,
  };
}

describe("OpenRouter agent quiz generator integration", () => {
  it("can access tail content beyond the direct prompt cap via chunk tools", async () => {
    const seenChunks: string[] = [];
    const generator = createOpenRouterAgentQuizGenerator(
      { apiKey: "integration-key", model: "openai/gpt-4.1-mini" },
      {
        createAgentRunner: (options) => ({
          invoke: vi.fn(async () => {
            const [getNextChunkTool, proposeQuestionsTool] = options.tools;

            for (;;) {
              const chunk = await getNextChunkTool.invoke({});

              if ("done" in chunk && chunk.done) {
                break;
              }

              if ("text" in chunk) {
                seenChunks.push(chunk.text);
              }
            }

            await proposeQuestionsTool.invoke({
              questions: [
                {
                  id: "q1",
                  prompt: "Which planet is described as the hottest planet?",
                  type: "single",
                  options: [
                    { id: "q1-a", label: "Mercury" },
                    { id: "q1-b", label: "Venus" },
                    { id: "q1-c", label: "Earth" },
                    { id: "q1-d", label: "Mars" },
                  ],
                  correctOptionIds: ["q1-b"],
                },
                {
                  id: "q2",
                  prompt: "Which heading appears near the tail marker section?",
                  type: "single",
                  options: [
                    { id: "q2-a", label: "Tail Marker" },
                    { id: "q2-b", label: "Head Marker" },
                    { id: "q2-c", label: "Middle Marker" },
                    { id: "q2-d", label: "Start Marker" },
                  ],
                  correctOptionIds: ["q2-a"],
                },
                {
                  id: "q3",
                  prompt: "Which planet name appears in the tail content?",
                  type: "single",
                  options: [
                    { id: "q3-a", label: "Venus" },
                    { id: "q3-b", label: "Saturn" },
                    { id: "q3-c", label: "Uranus" },
                    { id: "q3-d", label: "Neptune" },
                  ],
                  correctOptionIds: ["q3-a"],
                },
                {
                  id: "q4",
                  prompt:
                    "Which repeated planet name appears throughout the large source?",
                  type: "single",
                  options: [
                    { id: "q4-a", label: "Mercury" },
                    { id: "q4-b", label: "Neptune" },
                    { id: "q4-c", label: "Pluto" },
                    { id: "q4-d", label: "Saturn" },
                  ],
                  correctOptionIds: ["q4-a"],
                },
                {
                  id: "q5",
                  prompt: "Which source word marks the tail section heading?",
                  type: "single",
                  options: [
                    { id: "q5-a", label: "Tail" },
                    { id: "q5-b", label: "Root" },
                    { id: "q5-c", label: "Node" },
                    { id: "q5-d", label: "Leaf" },
                  ],
                  correctOptionIds: ["q5-a"],
                },
              ],
            });
          }),
        }),
        createModel: () => ({}) as never,
      },
    );

    const quiz = await generator.generate({
      questionCount: 5,
      source: createLargeMarkdownSource(),
    });

    expect(quiz.questions).toHaveLength(5);
    expect(seenChunks.some((chunk) => chunk.includes("# Tail Marker"))).toBe(
      true,
    );
    expect(createLargeMarkdownSource().markdown.includes("# Tail Marker")).toBe(
      false,
    );
  });
});
