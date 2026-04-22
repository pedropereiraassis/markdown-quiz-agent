import { describe, expect, it } from "vitest";

import { buildAgentChunkWindows } from "../../../../src/infrastructure/markdown/build-agent-chunk-windows.js";

describe("buildAgentChunkWindows", () => {
  it("throws on empty or whitespace-only markdown", () => {
    expect(() => buildAgentChunkWindows("")).toThrow(/non-empty markdown/);
    expect(() => buildAgentChunkWindows("   \n\n  ")).toThrow(
      /non-empty markdown/,
    );
  });

  it("packs multiple small chunks into a single window when they fit the budget", () => {
    const markdown = [
      "# Intro",
      "",
      "First paragraph text.",
      "",
      "## Details",
      "",
      "Details paragraph.",
    ].join("\n");

    const result = buildAgentChunkWindows(markdown, {
      windowCharBudget: 1_000,
      maxWindows: 4,
      preferredChunkChars: 200,
    });

    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]?.index).toBe(0);
    expect(result.windows[0]?.text).toContain("# Intro");
    expect(result.windows[0]?.text).toContain("## Details");
    expect(result.wasCapped).toBe(false);
    expect(result.totalChunkCount).toBeGreaterThanOrEqual(2);
  });

  it("splits chunks into ordered windows when the budget is small", () => {
    const first = `# One\n\n${"A".repeat(30)}`;
    const second = `# Two\n\n${"B".repeat(30)}`;
    const third = `# Three\n\n${"C".repeat(30)}`;
    const markdown = [first, second, third].join("\n\n");

    const result = buildAgentChunkWindows(markdown, {
      windowCharBudget: 60,
      maxWindows: 4,
      preferredChunkChars: 50,
    });

    expect(result.windows.map((window) => window.text)).toEqual([
      first,
      second,
      third,
    ]);
    expect(result.wasCapped).toBe(false);
  });

  it("never splits a chunk across windows even if the chunk exceeds the budget", () => {
    const huge = `# Heading\n\n${"X".repeat(500)}`;
    const result = buildAgentChunkWindows(huge, {
      windowCharBudget: 100,
      maxWindows: 4,
      preferredChunkChars: 600,
    });

    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]?.text.length).toBe(huge.length);
  });

  it("merges adjacent windows to maxWindows without dropping later content", () => {
    const chunks = Array.from(
      { length: 6 },
      (_, index) => `# Heading ${index}\n\nParagraph ${index}.`,
    );
    const markdown = chunks.join("\n\n");

    const result = buildAgentChunkWindows(markdown, {
      windowCharBudget: 40,
      maxWindows: 3,
      preferredChunkChars: 50,
    });

    expect(result.windows).toHaveLength(3);
    expect(result.wasCapped).toBe(true);
    expect(result.windows.map((window) => window.index)).toEqual([0, 1, 2]);
    const mergedText = result.windows.map((window) => window.text).join("\n\n");
    expect(mergedText).toContain("# Heading 0");
    expect(mergedText).toContain("# Heading 5");
  });

  it("preserves source order across windows", () => {
    const markdown = [
      "# First",
      "One.",
      "",
      "# Second",
      "Two.",
      "",
      "# Third",
      "Three.",
    ].join("\n");

    const result = buildAgentChunkWindows(markdown, {
      windowCharBudget: 20,
      maxWindows: 4,
      preferredChunkChars: 20,
    });

    const texts = result.windows.map((window) => window.text).join("\n\n");
    expect(texts.indexOf("First")).toBeLessThan(texts.indexOf("Second"));
    expect(texts.indexOf("Second")).toBeLessThan(texts.indexOf("Third"));
  });

  it("rejects non-positive-integer options", () => {
    expect(() =>
      buildAgentChunkWindows("# hi\n", { windowCharBudget: 0 }),
    ).toThrow(/windowCharBudget/);
    expect(() => buildAgentChunkWindows("# hi\n", { maxWindows: -1 })).toThrow(
      /maxWindows/,
    );
    expect(() =>
      buildAgentChunkWindows("# hi\n", { preferredChunkChars: 1.5 }),
    ).toThrow(/preferredChunkChars/);
  });
});
