import { describe, expect, it } from 'vitest';

import {
  chunkMarkdown,
  splitMarkdownIntoChunks,
} from '../../../../src/infrastructure/markdown/chunk-markdown.js';

describe('chunkMarkdown', () => {
  it('preserves heading order and falls back to paragraph chunks before hard splitting', () => {
    const firstParagraph = 'A'.repeat(50);
    const secondParagraph = 'B'.repeat(50);
    const oversizedParagraph = 'C'.repeat(120);
    const markdown = [
      '# Intro',
      '',
      firstParagraph,
      '',
      secondParagraph,
      '',
      '## Details',
      '',
      oversizedParagraph,
    ].join('\n');

    expect(splitMarkdownIntoChunks(markdown, 80)).toEqual([
      `# Intro\n\n${firstParagraph}`,
      secondParagraph,
      '## Details',
      'C'.repeat(80),
      'C'.repeat(40),
    ]);
  });

  it('keeps the first chunks that fit the prompt cap and hard truncates the final chunk when needed', () => {
    const firstChunk = `# One\n\n${'A'.repeat(30)}`;
    const secondChunk = `# Two\n\n${'B'.repeat(30)}`;
    const markdown = [firstChunk, secondChunk, `# Three\n\n${'C'.repeat(30)}`].join('\n\n');

    const result = chunkMarkdown(markdown, {
      preferredChunkChars: 40,
      promptCharCap: 65,
    });

    expect(result.wasTruncated).toBe(true);
    expect(result.markdown).toBe(`${firstChunk}\n\n${secondChunk.slice(0, 26)}`);
    expect(result.markdown.length).toBe(65);
    expect(result.originalCharacters).toBe(markdown.length);
    expect(result.retainedCharacters).toBe(65);
    expect(result.chunkCount).toBe(2);
  });

  it('returns the original markdown unchanged when it already fits within the prompt cap', () => {
    const markdown = '# Small\n\nShort paragraph.\n\n## Next\n\nAnother paragraph.';

    const result = chunkMarkdown(markdown);

    expect(result).toEqual({
      markdown,
      wasTruncated: false,
      originalCharacters: markdown.length,
      retainedCharacters: markdown.length,
      chunkCount: 2,
    });
  });

  it('rejects non-positive chunking options', () => {
    expect(() => splitMarkdownIntoChunks('# Heading', 0)).toThrow(/preferredChunkChars/);
    expect(() => chunkMarkdown('# Heading', { promptCharCap: 0 })).toThrow(/promptCharCap/);
  });
});
