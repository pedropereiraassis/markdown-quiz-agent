import { describe, expect, it, vi } from "vitest";

import { createQuizGenerator } from "../../../../src/infrastructure/llm/create-quiz-generator.js";
import type { MarkdownSource } from "../../../../src/infrastructure/markdown/fetch-markdown.js";

function createSource(overrides: Partial<MarkdownSource> = {}): MarkdownSource {
  return {
    chunkCount: 1,
    markdown: "# Title\n\nBody",
    normalizedUrl: "https://example.com/source.md",
    originalCharacters: 14,
    originalUrl: "https://example.com/source.md",
    retainedCharacters: 14,
    title: "Title",
    wasTruncated: false,
    ...overrides,
  };
}

describe("createQuizGenerator", () => {
  it("uses the direct generator for non-truncated sources in auto mode", async () => {
    const directGenerate = vi.fn(async () => ({ questions: [] }));
    const agentGenerate = vi.fn(async () => ({ questions: [] }));
    const generator = createQuizGenerator({
      agentGenerator: { generate: agentGenerate },
      agentMode: "auto",
      directGenerator: { generate: directGenerate },
    });

    await generator.generate({ source: createSource({ wasTruncated: false }) });

    expect(directGenerate).toHaveBeenCalledOnce();
    expect(agentGenerate).not.toHaveBeenCalled();
  });

  it("uses the agent generator for truncated sources in auto mode", async () => {
    const directGenerate = vi.fn(async () => ({ questions: [] }));
    const agentGenerate = vi.fn(async () => ({ questions: [] }));
    const generator = createQuizGenerator({
      agentGenerator: { generate: agentGenerate },
      agentMode: "auto",
      directGenerator: { generate: directGenerate },
    });

    await generator.generate({ source: createSource({ wasTruncated: true }) });

    expect(agentGenerate).toHaveBeenCalledOnce();
    expect(directGenerate).not.toHaveBeenCalled();
  });

  it("honors QUIZ_AGENT_MODE=off", async () => {
    const directGenerate = vi.fn(async () => ({ questions: [] }));
    const agentGenerate = vi.fn(async () => ({ questions: [] }));
    const generator = createQuizGenerator({
      agentGenerator: { generate: agentGenerate },
      agentMode: "off",
      directGenerator: { generate: directGenerate },
    });

    await generator.generate({ source: createSource({ wasTruncated: true }) });

    expect(directGenerate).toHaveBeenCalledOnce();
    expect(agentGenerate).not.toHaveBeenCalled();
  });

  it("honors QUIZ_AGENT_MODE=always", async () => {
    const directGenerate = vi.fn(async () => ({ questions: [] }));
    const agentGenerate = vi.fn(async () => ({ questions: [] }));
    const generator = createQuizGenerator({
      agentGenerator: { generate: agentGenerate },
      agentMode: "always",
      directGenerator: { generate: directGenerate },
    });

    await generator.generate({ source: createSource({ wasTruncated: false }) });

    expect(agentGenerate).toHaveBeenCalledOnce();
    expect(directGenerate).not.toHaveBeenCalled();
  });
});
