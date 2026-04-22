import { FETCH_LIMITS, SUPPORTED_TEXT_CONTENT_TYPES } from '../../config/constants.js';
import { chunkMarkdown } from './chunk-markdown.js';
import { normalizeMarkdownSourceUrl } from './normalize-github-url.js';

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const AMBIGUOUS_CONTENT_TYPES = new Set([
  'application/octet-stream',
  'application/unknown',
  'binary/octet-stream',
]);

export type MarkdownIngestionErrorCode =
  | 'empty_response'
  | 'http_error'
  | 'invalid_url'
  | 'invalid_utf8'
  | 'network_error'
  | 'redirect_limit'
  | 'response_too_large'
  | 'timeout'
  | 'unsupported_content_type'
  | 'unsupported_scheme';

export interface MarkdownSource {
  originalUrl: string;
  normalizedUrl: string;
  title: string | null;
  markdown: string;
  wasTruncated: boolean;
  originalCharacters: number;
  retainedCharacters: number;
  chunkCount: number;
}

export interface FetchMarkdownOptions {
  fetchFn?: FetchLike;
  maxBytes?: number;
  maxRedirects?: number;
  preferredChunkChars?: number;
  promptCharCap?: number;
  timeoutMs?: number;
}

export interface MarkdownIngestionErrorOptions {
  cause?: unknown;
  code: MarkdownIngestionErrorCode;
  message: string;
  statusCode?: number;
  url: string;
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class MarkdownIngestionError extends Error {
  readonly code: MarkdownIngestionErrorCode;
  readonly url: string;
  readonly statusCode?: number;

  constructor(options: MarkdownIngestionErrorOptions) {
    super(options.message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'MarkdownIngestionError';
    this.code = options.code;
    this.url = options.url;

    if (options.statusCode !== undefined) {
      this.statusCode = options.statusCode;
    }
  }
}

export async function fetchMarkdown(
  sourceUrl: string,
  options: FetchMarkdownOptions = {},
): Promise<MarkdownSource> {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? FETCH_LIMITS.timeoutMs;
  const maxRedirects = options.maxRedirects ?? FETCH_LIMITS.maxRedirects;
  const maxBytes = options.maxBytes ?? FETCH_LIMITS.maxBytes;
  const promptCharCap = options.promptCharCap ?? FETCH_LIMITS.promptCharCap;
  const preferredChunkChars = options.preferredChunkChars ?? FETCH_LIMITS.preferredChunkChars;

  const normalizedUrl = normalizeSourceUrl(sourceUrl);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchWithRedirects(normalizedUrl, {
      fetchFn,
      maxRedirects,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new MarkdownIngestionError({
        code: 'http_error',
        message: `Source request failed with HTTP ${response.status}`,
        statusCode: response.status,
        url: normalizedUrl,
      });
    }

    const contentType = classifyContentType(response.headers.get('content-type'));

    if (contentType === 'unsupported') {
      throw new MarkdownIngestionError({
        code: 'unsupported_content_type',
        message: 'Source response content-type is not supported for Markdown ingestion',
        url: normalizedUrl,
      });
    }

    const responseBytes = await readResponseBytes(response, normalizedUrl, maxBytes);
    const decoded = decodeUtf8(responseBytes, normalizedUrl);
    const normalizedMarkdown = normalizeMarkdownText(decoded, normalizedUrl);
    const boundedMarkdown = chunkMarkdown(normalizedMarkdown, {
      preferredChunkChars,
      promptCharCap,
    });

    return {
      originalUrl: sourceUrl,
      normalizedUrl,
      title: deriveSourceTitle(normalizedMarkdown, normalizedUrl),
      markdown: boundedMarkdown.markdown,
      wasTruncated: boundedMarkdown.wasTruncated,
      originalCharacters: boundedMarkdown.originalCharacters,
      retainedCharacters: boundedMarkdown.retainedCharacters,
      chunkCount: boundedMarkdown.chunkCount,
    };
  } catch (error) {
    if (error instanceof MarkdownIngestionError) {
      throw error;
    }

    if (isAbortError(error) || controller.signal.aborted) {
      throw new MarkdownIngestionError({
        code: 'timeout',
        message: `Source request exceeded the ${timeoutMs} ms timeout`,
        cause: error,
        url: normalizedUrl,
      });
    }

    throw new MarkdownIngestionError({
      code: 'network_error',
      message: 'Source request failed before Markdown could be ingested',
      cause: error,
      url: normalizedUrl,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function normalizeSourceUrl(sourceUrl: string): string {
  try {
    return normalizeMarkdownSourceUrl(sourceUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid source URL';

    if (message.startsWith('Unsupported URL scheme:')) {
      throw new MarkdownIngestionError({
        code: 'unsupported_scheme',
        message,
        cause: error,
        url: sourceUrl,
      });
    }

    throw new MarkdownIngestionError({
      code: 'invalid_url',
      message: 'Source URL must be a valid absolute http:// or https:// URL',
      cause: error,
      url: sourceUrl,
    });
  }
}

async function fetchWithRedirects(
  url: string,
  options: {
    fetchFn: FetchLike;
    maxRedirects: number;
    signal: AbortSignal;
  },
): Promise<Response> {
  let currentUrl = url;

  for (let redirectCount = 0; ; redirectCount += 1) {
    const response = await options.fetchFn(currentUrl, {
      headers: {
        accept: 'text/markdown, text/plain;q=0.9, text/x-markdown;q=0.9, */*;q=0.1',
      },
      method: 'GET',
      redirect: 'manual',
      signal: options.signal,
    });

    if (!REDIRECT_STATUS_CODES.has(response.status)) {
      return response;
    }

    await response.body?.cancel().catch(() => undefined);

    if (redirectCount >= options.maxRedirects) {
      throw new MarkdownIngestionError({
        code: 'redirect_limit',
        message: `Source request exceeded the ${options.maxRedirects} redirect limit`,
        statusCode: response.status,
        url,
      });
    }

    const location = response.headers.get('location');

    if (!location) {
      throw new MarkdownIngestionError({
        code: 'network_error',
        message: 'Redirect response is missing a Location header',
        statusCode: response.status,
        url: currentUrl,
      });
    }

    currentUrl = normalizeRedirectUrl(currentUrl, location);
  }
}

function normalizeRedirectUrl(currentUrl: string, location: string): string {
  let redirectedUrl: URL;

  try {
    redirectedUrl = new URL(location, currentUrl);
  } catch (error) {
    throw new MarkdownIngestionError({
      code: 'network_error',
      message: 'Redirect response location is invalid',
      cause: error,
      url: currentUrl,
    });
  }

  if (!['http:', 'https:'].includes(redirectedUrl.protocol)) {
    throw new MarkdownIngestionError({
      code: 'unsupported_scheme',
      message: `Unsupported URL scheme: ${redirectedUrl.protocol}`,
      url: redirectedUrl.toString(),
    });
  }

  return redirectedUrl.toString();
}

async function readResponseBytes(
  response: Response,
  url: string,
  maxBytes: number,
): Promise<Uint8Array> {
  const contentLength = response.headers.get('content-length');

  if (contentLength) {
    const parsedLength = Number.parseInt(contentLength, 10);

    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      throw new MarkdownIngestionError({
        code: 'response_too_large',
        message: `Source response exceeds the ${maxBytes} byte limit`,
        url,
      });
    }
  }

  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let completed = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        completed = true;
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        throw new MarkdownIngestionError({
          code: 'response_too_large',
          message: `Source response exceeds the ${maxBytes} byte limit`,
          url,
        });
      }

      chunks.push(value);
    }
  } finally {
    if (!completed) {
      try {
        await reader.cancel();
      } catch {
        // Ignore cancellation errors because the original failure is more important.
      }
    }

    reader.releaseLock();
  }

  return mergeChunks(chunks, totalBytes);
}

function mergeChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const merged = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}

function decodeUtf8(bytes: Uint8Array, url: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new MarkdownIngestionError({
      code: 'invalid_utf8',
      message: 'Source response could not be decoded as UTF-8 text',
      cause: error,
      url,
    });
  }
}

function normalizeMarkdownText(text: string, url: string): string {
  const normalized = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .normalize('NFC')
    .replace(/^\u0000+/, '')
    .replace(/\u0000+$/, '');

  if (normalized.includes('\u0000')) {
    throw new MarkdownIngestionError({
      code: 'invalid_utf8',
      message: 'Source response contains embedded null bytes after UTF-8 normalization',
      url,
    });
  }

  if (normalized.trim().length === 0) {
    throw new MarkdownIngestionError({
      code: 'empty_response',
      message: 'Source response did not contain any Markdown text',
      url,
    });
  }

  return normalized;
}

function classifyContentType(contentTypeHeader: string | null): 'supported' | 'ambiguous' | 'unsupported' {
  if (!contentTypeHeader) {
    return 'ambiguous';
  }

  const mediaType = contentTypeHeader.split(';', 1)[0]?.trim().toLowerCase();

  if (!mediaType) {
    return 'ambiguous';
  }

  if (SUPPORTED_TEXT_CONTENT_TYPES.includes(mediaType)) {
    return 'supported';
  }

  if (AMBIGUOUS_CONTENT_TYPES.has(mediaType)) {
    return 'ambiguous';
  }

  return 'unsupported';
}

function deriveSourceTitle(markdown: string, normalizedUrl: string): string | null {
  return extractTitleFromMarkdown(markdown) ?? extractTitleFromUrl(normalizedUrl);
}

function extractTitleFromMarkdown(markdown: string): string | null {
  const lines = markdown.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';

    if (line.length === 0) {
      continue;
    }

    const atxHeading = line.match(/^#{1,6}\s+(.+?)\s*#*$/);

    if (atxHeading?.[1]) {
      return atxHeading[1].trim();
    }

    const underline = lines[index + 1]?.trim() ?? '';

    if (/^(=+|-+)$/.test(underline)) {
      return line;
    }
  }

  return null;
}

function extractTitleFromUrl(normalizedUrl: string): string | null {
  const lastPathSegment = new URL(normalizedUrl).pathname.split('/').filter(Boolean).at(-1);

  if (!lastPathSegment) {
    return null;
  }

  const decoded = decodeURIComponent(lastPathSegment).replace(/\.(markdown|md|txt)$/i, '');

  return decoded.length > 0 ? decoded : null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
