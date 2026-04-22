import { describe, expect, it, vi } from "vitest";

import {
  fetchMarkdown,
  MarkdownIngestionError,
} from "../../../../src/infrastructure/markdown/fetch-markdown.js";

describe("fetchMarkdown integration", () => {
  it("runs normalization, fetch, truncation, and metadata shaping in one call", async () => {
    const repeatedParagraph = "Paragraph ".repeat(250);
    const markdown = [
      "# Example Title\r",
      "\r",
      "Intro paragraph.\r",
      "\r",
      "## Section One\r",
      "\r",
      repeatedParagraph,
      "\r",
      "## Section Two\r",
      "\r",
      repeatedParagraph,
    ].join("\n");

    const fetchFn = vi.fn(async (input: string | URL) => {
      expect(String(input)).toBe(
        "https://raw.githubusercontent.com/openai/docs/main/guides/example.md",
      );

      return new Response(markdown, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
        status: 200,
      });
    });

    const result = await fetchMarkdown(
      "https://github.com/openai/docs/blob/main/guides/example.md?raw=1#intro",
      {
        fetchFn,
        preferredChunkChars: 120,
        promptCharCap: 260,
      },
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      originalUrl:
        "https://github.com/openai/docs/blob/main/guides/example.md?raw=1#intro",
      normalizedUrl:
        "https://raw.githubusercontent.com/openai/docs/main/guides/example.md",
      title: "Example Title",
      wasTruncated: true,
    });
    expect(result.markdown.length).toBeLessThanOrEqual(260);
    expect(
      result.markdown.startsWith("# Example Title\n\nIntro paragraph."),
    ).toBe(true);
    expect(result.markdown.includes("## Section One")).toBe(true);
    expect(result.originalCharacters).toBeGreaterThan(
      result.retainedCharacters,
    );
    expect(result.chunkCount).toBeGreaterThan(1);
  });

  it("surfaces timeout failures as typed ingestion errors", async () => {
    const fetchFn = vi.fn(
      async (_input: string | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () =>
              reject(
                new DOMException("The operation was aborted.", "AbortError"),
              ),
            { once: true },
          );
        }),
    );

    await expect(
      fetchMarkdown("https://example.com/slow.md", {
        fetchFn,
        timeoutMs: 5,
      }),
    ).rejects.toSatisfy((error) => {
      expect(error).toBeInstanceOf(MarkdownIngestionError);
      expect(error).toMatchObject({ code: "timeout" });
      return true;
    });
  });

  it("surfaces redirect-limit failures as typed ingestion errors", async () => {
    const redirectMap = new Map<string, string>([
      ["https://example.com/start.md", "https://example.com/step-1.md"],
      ["https://example.com/step-1.md", "https://example.com/step-2.md"],
      ["https://example.com/step-2.md", "https://example.com/step-3.md"],
      ["https://example.com/step-3.md", "https://example.com/step-4.md"],
    ]);

    const fetchFn = vi.fn(async (input: string | URL) => {
      const currentUrl = String(input);
      const location = redirectMap.get(currentUrl);

      if (!location) {
        return new Response("# Final", {
          headers: { "content-type": "text/plain; charset=utf-8" },
          status: 200,
        });
      }

      return new Response(null, {
        headers: { location },
        status: 302,
      });
    });

    await expect(
      fetchMarkdown("https://example.com/start.md", {
        fetchFn,
        maxRedirects: 3,
      }),
    ).rejects.toSatisfy((error) => {
      expect(error).toBeInstanceOf(MarkdownIngestionError);
      expect(error).toMatchObject({ code: "redirect_limit" });
      return true;
    });

    expect(fetchFn).toHaveBeenCalledTimes(4);
  });
});
