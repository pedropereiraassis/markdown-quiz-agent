import { describe, expect, it, vi } from "vitest";

import {
  promptSourceUrl,
  validateSourceUrlInput,
} from "../../../src/interfaces/cli/prompt-source-url.js";

describe("CLI source URL prompt", () => {
  it.each([
    [undefined, "Enter a Markdown URL to continue."],
    ["   ", "Enter a Markdown URL to continue."],
    ["not-a-url", "Enter a valid absolute http:// or https:// URL."],
    [
      "ftp://example.com/guide.md",
      "Enter a valid absolute http:// or https:// URL.",
    ],
    ["https://example.com/guide.md", undefined],
  ])("validates %s", (value, expected) => {
    expect(validateSourceUrlInput(value)).toBe(expected);
  });

  it("returns the trimmed URL from the text prompt", async () => {
    const promptText = vi
      .fn()
      .mockResolvedValue("  https://example.com/guide.md  ");

    await expect(promptSourceUrl({ promptText })).resolves.toBe(
      "https://example.com/guide.md",
    );
    expect(promptText).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Paste a Markdown URL to build a quiz.",
        placeholder: "https://example.com/guide.md",
      }),
    );
  });
});
