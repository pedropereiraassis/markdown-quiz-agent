import { describe, expect, it, vi } from "vitest";

import { FETCH_LIMITS } from "../../../../src/config/constants.js";
import {
  fetchMarkdown,
  MarkdownIngestionError,
} from "../../../../src/infrastructure/markdown/fetch-markdown.js";
import { normalizeGitHubBlobUrl } from "../../../../src/infrastructure/markdown/normalize-github-url.js";

describe("normalizeGitHubBlobUrl", () => {
  it("converts GitHub blob URLs to raw URLs after removing query and hash fragments", () => {
    expect(
      normalizeGitHubBlobUrl(
        "https://github.com/openai/docs/blob/main/guides/quiz.md?raw=1#section",
      ),
    ).toBe("https://raw.githubusercontent.com/openai/docs/main/guides/quiz.md");
  });

  it("returns null for non-blob GitHub URLs and incomplete blob paths", () => {
    expect(
      normalizeGitHubBlobUrl("https://github.com/openai/docs/tree/main/guides"),
    ).toBeNull();
    expect(
      normalizeGitHubBlobUrl("https://github.com/openai/docs/blob/main"),
    ).toBeNull();
  });
});

describe("fetchMarkdown", () => {
  it("rejects invalid absolute URLs", async () => {
    await expect(fetchMarkdown("not-a-url")).rejects.toMatchObject({
      code: "invalid_url",
    });
  });

  it("rejects unsupported URL schemes before issuing a fetch request", async () => {
    const fetchFn = vi.fn();

    await expect(
      fetchMarkdown("file:///tmp/notes.md", { fetchFn }),
    ).rejects.toMatchObject({
      code: "unsupported_scheme",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects empty responses and unsupported content types", async () => {
    await expect(
      fetchMarkdown("https://example.com/empty.md", {
        fetchFn: vi.fn(
          async () =>
            new Response("", {
              headers: { "content-type": "text/plain; charset=utf-8" },
              status: 200,
            }),
        ),
      }),
    ).rejects.toMatchObject({
      code: "empty_response",
    });

    await expect(
      fetchMarkdown("https://example.com/image.md", {
        fetchFn: vi.fn(
          async () =>
            new Response("not markdown", {
              headers: { "content-type": "image/png" },
              status: 200,
            }),
        ),
      }),
    ).rejects.toMatchObject({
      code: "unsupported_content_type",
    });
  });

  it("cancels response bodies before failing on HTTP errors and unsupported content types", async () => {
    const httpErrorCancel = vi.fn().mockResolvedValue(undefined);
    const unsupportedTypeCancel = vi.fn().mockResolvedValue(undefined);

    await expect(
      fetchMarkdown("https://example.com/missing.md", {
        fetchFn: vi.fn(
          async () =>
            ({
              body: { cancel: httpErrorCancel },
              headers: new Headers({
                "content-type": "text/plain; charset=utf-8",
              }),
              ok: false,
              status: 404,
            }) as unknown as Response,
        ),
      }),
    ).rejects.toMatchObject({
      code: "http_error",
    });

    await expect(
      fetchMarkdown("https://example.com/image.md", {
        fetchFn: vi.fn(
          async () =>
            ({
              body: { cancel: unsupportedTypeCancel },
              headers: new Headers({ "content-type": "image/png" }),
              ok: true,
              status: 200,
            }) as unknown as Response,
        ),
      }),
    ).rejects.toMatchObject({
      code: "unsupported_content_type",
    });

    expect(httpErrorCancel).toHaveBeenCalledOnce();
    expect(unsupportedTypeCancel).toHaveBeenCalledOnce();
  });

  it("accepts ambiguous content types only when UTF-8 decoding succeeds within size limits", async () => {
    const validResult = await fetchMarkdown("https://example.com/source.md", {
      fetchFn: vi.fn(
        async () =>
          new Response("# Valid\n\nMarkdown body.", {
            headers: { "content-type": "application/octet-stream" },
            status: 200,
          }),
      ),
    });

    expect(validResult.markdown).toBe("# Valid\n\nMarkdown body.");
    expect(validResult.title).toBe("Valid");

    await expect(
      fetchMarkdown("https://example.com/binary.md", {
        fetchFn: vi.fn(
          async () =>
            new Response(new Uint8Array([0xff, 0xfe, 0xfd]), {
              headers: { "content-type": "application/octet-stream" },
              status: 200,
            }),
        ),
      }),
    ).rejects.toMatchObject({
      code: "invalid_utf8",
    });
  });

  it("accepts missing content-type headers when the body decodes as UTF-8 markdown", async () => {
    const result = await fetchMarkdown("https://example.com/setext.md", {
      fetchFn: vi.fn(
        async () =>
          new Response("Document Title\n=====\n\nBody text.", { status: 200 }),
      ),
    });

    expect(result.title).toBe("Document Title");
    expect(result.markdown).toContain("Body text.");
  });

  it("falls back to the URL filename when the markdown has no heading title", async () => {
    const result = await fetchMarkdown(
      "https://example.com/path/reference-guide.md",
      {
        fetchFn: vi.fn(
          async () =>
            new Response("Plain paragraph without a heading.", {
              headers: { "content-type": "text/plain; charset=utf-8" },
              status: 200,
            }),
        ),
      },
    );

    expect(result.title).toBe("reference-guide");
  });

  it("enforces the prompt cap on bounded results", async () => {
    const markdown = `# Large\n\n${"A".repeat(FETCH_LIMITS.promptCharCap + 200)}`;

    const result = await fetchMarkdown("https://example.com/large.md", {
      fetchFn: vi.fn(
        async () =>
          new Response(markdown, {
            headers: { "content-type": "text/markdown; charset=utf-8" },
            status: 200,
          }),
      ),
    });

    expect(result.wasTruncated).toBe(true);
    expect(result.markdown.length).toBeLessThanOrEqual(
      FETCH_LIMITS.promptCharCap,
    );
    expect(result.originalCharacters).toBe(markdown.length);
    expect(result.retainedCharacters).toBe(result.markdown.length);
  });

  it("rejects responses that declare a body larger than the byte limit before reading the stream", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const getReader = vi.fn(() => {
      throw new Error(
        "body reader should not be requested for oversized content-length responses",
      );
    });

    const oversizedResponse = {
      body: { cancel, getReader },
      headers: new Headers({
        "content-length": String(FETCH_LIMITS.maxBytes + 1),
        "content-type": "text/plain; charset=utf-8",
      }),
      ok: true,
      status: 200,
    } as unknown as Response;

    await expect(
      fetchMarkdown("https://example.com/too-large.md", {
        fetchFn: vi.fn(async () => oversizedResponse),
      }),
    ).rejects.toMatchObject({
      code: "response_too_large",
    });

    expect(getReader).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects body-less responses as empty markdown", async () => {
    const responseWithoutBody = {
      body: null,
      headers: new Headers({
        "content-type": "text/plain; charset=utf-8",
      }),
      ok: true,
      status: 200,
    } as unknown as Response;

    await expect(
      fetchMarkdown("https://example.com/no-body.md", {
        fetchFn: vi.fn(async () => responseWithoutBody),
      }),
    ).rejects.toMatchObject({
      code: "empty_response",
    });
  });

  it("cancels the redirect response body before following the location to release the connection", async () => {
    const cancelFn = vi.fn().mockResolvedValue(undefined);
    let callCount = 0;

    const result = await fetchMarkdown("https://example.com/start.md", {
      fetchFn: vi.fn(async () => {
        callCount += 1;

        if (callCount === 1) {
          return {
            body: { cancel: cancelFn },
            headers: new Headers({ location: "https://example.com/final.md" }),
            ok: false,
            status: 301,
          } as unknown as Response;
        }

        return new Response("# Redirected\n\nContent.", {
          headers: { "content-type": "text/markdown" },
          status: 200,
        });
      }),
    });

    expect(cancelFn).toHaveBeenCalledOnce();
    expect(result.markdown).toContain("Redirected");
  });

  it("rejects redirect responses without a location header", async () => {
    await expect(
      fetchMarkdown("https://example.com/missing-location.md", {
        fetchFn: vi.fn(async () => new Response(null, { status: 302 })),
      }),
    ).rejects.toMatchObject({
      code: "network_error",
    });
  });

  it("rejects redirects to unsupported URL schemes", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(null, {
          headers: { location: "ftp://example.com/source.md" },
          status: 302,
        }),
    );

    await expect(
      fetchMarkdown("https://example.com/start.md", {
        fetchFn,
      }),
    ).rejects.toMatchObject({
      code: "unsupported_scheme",
    });
  });

  it("surfaces typed ingestion errors when fetch fails unexpectedly", async () => {
    await expect(
      fetchMarkdown("https://example.com/network.md", {
        fetchFn: vi.fn(async () => {
          throw new Error("socket closed");
        }),
      }),
    ).rejects.toSatisfy((error) => {
      expect(error).toBeInstanceOf(MarkdownIngestionError);
      expect(error).toMatchObject({ code: "network_error" });
      return true;
    });
  });
});
