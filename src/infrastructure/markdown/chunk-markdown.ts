import { FETCH_LIMITS } from '../../config/constants.js';

export interface ChunkMarkdownOptions {
  promptCharCap?: number;
  preferredChunkChars?: number;
}

export interface ChunkMarkdownResult {
  markdown: string;
  wasTruncated: boolean;
  originalCharacters: number;
  retainedCharacters: number;
  chunkCount: number;
}

export function splitMarkdownIntoChunks(
  markdown: string,
  preferredChunkChars: number = FETCH_LIMITS.preferredChunkChars,
): string[] {
  assertPositiveInteger(preferredChunkChars, 'preferredChunkChars');

  const headingSections = splitMarkdownByHeadings(markdown);
  const chunks: string[] = [];

  for (const section of headingSections) {
    pushSectionChunks(section, preferredChunkChars, chunks);
  }

  return chunks;
}

export function chunkMarkdown(
  markdown: string,
  options: ChunkMarkdownOptions = {},
): ChunkMarkdownResult {
  const promptCharCap = options.promptCharCap ?? FETCH_LIMITS.promptCharCap;
  const preferredChunkChars = options.preferredChunkChars ?? FETCH_LIMITS.preferredChunkChars;

  assertPositiveInteger(promptCharCap, 'promptCharCap');
  assertPositiveInteger(preferredChunkChars, 'preferredChunkChars');

  const chunks = splitMarkdownIntoChunks(markdown, preferredChunkChars);

  if (markdown.length <= promptCharCap) {
    return {
      markdown,
      wasTruncated: false,
      originalCharacters: markdown.length,
      retainedCharacters: markdown.length,
      chunkCount: chunks.length,
    };
  }

  const selectedChunks: string[] = [];
  let retainedCharacters = 0;

  for (const chunk of chunks) {
    const separatorLength = selectedChunks.length === 0 ? 0 : 2;
    const nextLength = retainedCharacters + separatorLength + chunk.length;

    if (nextLength <= promptCharCap) {
      selectedChunks.push(chunk);
      retainedCharacters = nextLength;
      continue;
    }

    const remainingCharacters = promptCharCap - retainedCharacters - separatorLength;

    if (remainingCharacters > 0) {
      selectedChunks.push(chunk.slice(0, remainingCharacters));
      retainedCharacters += separatorLength + remainingCharacters;
    }

    break;
  }

  return {
    markdown: selectedChunks.join('\n\n'),
    wasTruncated: true,
    originalCharacters: markdown.length,
    retainedCharacters,
    chunkCount: selectedChunks.length,
  };
}

function pushSectionChunks(section: string, preferredChunkChars: number, chunks: string[]): void {
  if (section.length <= preferredChunkChars) {
    chunks.push(section);
    return;
  }

  const paragraphBlocks = splitMarkdownByParagraphs(section);
  let currentChunk = '';

  for (const block of paragraphBlocks) {
    if (block.length > preferredChunkChars) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = '';
      }

      chunks.push(...splitByCharacterLimit(block, preferredChunkChars));
      continue;
    }

    const candidateChunk = currentChunk.length === 0 ? block : `${currentChunk}\n\n${block}`;

    if (candidateChunk.length <= preferredChunkChars) {
      currentChunk = candidateChunk;
      continue;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    currentChunk = block;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
}

function splitMarkdownByHeadings(markdown: string): string[] {
  const lines = markdown.split('\n');
  const sections: string[] = [];
  let currentSection: string[] = [];

  for (const line of lines) {
    if (isHeadingLine(line) && currentSection.length > 0) {
      const section = trimOuterBlankLines(currentSection.join('\n'));

      if (section.length > 0) {
        sections.push(section);
      }

      currentSection = [line];
      continue;
    }

    currentSection.push(line);
  }

  const trailingSection = trimOuterBlankLines(currentSection.join('\n'));

  if (trailingSection.length > 0) {
    sections.push(trailingSection);
  }

  return sections;
}

function splitMarkdownByParagraphs(section: string): string[] {
  const lines = section.split('\n');
  const blocks: string[] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    if (line.trim().length === 0) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
      }

      continue;
    }

    currentBlock.push(line);
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n'));
  }

  return blocks.map(trimOuterBlankLines).filter((block) => block.length > 0);
}

function splitByCharacterLimit(text: string, limit: number): string[] {
  const parts: string[] = [];

  for (let start = 0; start < text.length; start += limit) {
    parts.push(text.slice(start, start + limit));
  }

  return parts;
}

function trimOuterBlankLines(text: string): string {
  return text.replace(/^\n+/, '').replace(/\n+$/, '');
}

function isHeadingLine(line: string): boolean {
  return /^#{1,6}\s+\S/.test(line);
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}
