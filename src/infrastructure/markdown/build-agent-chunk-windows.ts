import { AGENT_LIMITS, FETCH_LIMITS } from "../../config/constants.js";
import { splitMarkdownIntoChunks } from "./chunk-markdown.js";

export interface AgentChunkWindow {
  index: number;
  text: string;
  characterCount: number;
}

export interface BuildAgentChunkWindowsResult {
  windows: AgentChunkWindow[];
  totalChunkCount: number;
  totalCharacterCount: number;
  wasCapped: boolean;
}

export interface BuildAgentChunkWindowsOptions {
  windowCharBudget?: number;
  maxWindows?: number;
  preferredChunkChars?: number;
}

export function buildAgentChunkWindows(
  markdown: string,
  options: BuildAgentChunkWindowsOptions = {},
): BuildAgentChunkWindowsResult {
  if (typeof markdown !== "string" || markdown.trim().length === 0) {
    throw new Error("buildAgentChunkWindows requires non-empty markdown");
  }

  const windowCharBudget =
    options.windowCharBudget ?? AGENT_LIMITS.roundPromptBudgetChars;
  const maxWindows = options.maxWindows ?? AGENT_LIMITS.maxAgentRounds;
  const preferredChunkChars =
    options.preferredChunkChars ?? FETCH_LIMITS.preferredChunkChars;

  assertPositiveInteger(windowCharBudget, "windowCharBudget");
  assertPositiveInteger(maxWindows, "maxWindows");
  assertPositiveInteger(preferredChunkChars, "preferredChunkChars");

  const chunks = splitMarkdownIntoChunks(markdown, preferredChunkChars);
  const packed: string[] = [];
  let buffer = "";

  for (const chunk of chunks) {
    if (chunk.length >= windowCharBudget) {
      if (buffer.length > 0) {
        packed.push(buffer);
        buffer = "";
      }
      packed.push(chunk);
      continue;
    }

    const separatorLength = buffer.length === 0 ? 0 : 2;
    const projected = buffer.length + separatorLength + chunk.length;

    if (projected <= windowCharBudget) {
      buffer = buffer.length === 0 ? chunk : `${buffer}\n\n${chunk}`;
      continue;
    }

    if (buffer.length > 0) {
      packed.push(buffer);
    }
    buffer = chunk;
  }

  if (buffer.length > 0) {
    packed.push(buffer);
  }

  const capped = packed.length > maxWindows;
  const selected = capped ? mergePackedWindows(packed, maxWindows) : packed;

  const windows: AgentChunkWindow[] = selected.map((text, index) => ({
    index,
    text,
    characterCount: text.length,
  }));

  const totalCharacterCount = windows.reduce(
    (sum, window) => sum + window.characterCount,
    0,
  );

  return {
    windows,
    totalChunkCount: chunks.length,
    totalCharacterCount,
    wasCapped: capped,
  };
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function mergePackedWindows(
  packed: readonly string[],
  maxWindows: number,
): string[] {
  if (packed.length <= maxWindows) {
    return [...packed];
  }

  const groups: string[] = [];
  let cursor = 0;
  const baseGroupSize = Math.floor(packed.length / maxWindows);
  const remainder = packed.length % maxWindows;

  for (let index = 0; index < maxWindows; index += 1) {
    const groupSize = baseGroupSize + (index < remainder ? 1 : 0);
    const group = packed.slice(cursor, cursor + groupSize).join("\n\n");

    groups.push(group);
    cursor += groupSize;
  }

  return groups;
}
