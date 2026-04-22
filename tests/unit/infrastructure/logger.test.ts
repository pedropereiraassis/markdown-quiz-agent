import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CLI_DEBUG_LOGS_ENV_VAR,
  CLI_DEBUG_LOGS_FLAG,
  CLI_DEBUG_LOGS_SHORT_FLAG,
  createCliLogger,
  shouldEnableCliDebugLogs,
} from '../../../src/infrastructure/logger.js';

describe('CLI logger selection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [{}, [], false],
    [{ [CLI_DEBUG_LOGS_ENV_VAR]: '0' }, [], false],
    [{ [CLI_DEBUG_LOGS_ENV_VAR]: '1' }, [], true],
    [{ [CLI_DEBUG_LOGS_ENV_VAR]: 'true' }, [], true],
    [{ [CLI_DEBUG_LOGS_ENV_VAR]: ' yes ' }, [], true],
    [{ [CLI_DEBUG_LOGS_ENV_VAR]: 'ON' }, [], true],
    [{}, [CLI_DEBUG_LOGS_FLAG], true],
    [{}, [CLI_DEBUG_LOGS_SHORT_FLAG], true],
  ])('resolves debug logging for %j and %j', (env, argv, expected) => {
    expect(shouldEnableCliDebugLogs(env, argv)).toBe(expected);
  });

  it('keeps the CLI logger quiet by default', () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    createCliLogger({}).info('source_fetch_started', { sourceUrl: 'https://example.com/guide.md' });
    createCliLogger({}).error('prepare_failed', { errorType: 'unexpected_failure' });

    expect(stdoutWrite).not.toHaveBeenCalled();
    expect(stderrWrite).not.toHaveBeenCalled();
  });

  it('emits JSON logs when debug logging is enabled', () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    createCliLogger({}, [CLI_DEBUG_LOGS_FLAG]).info('source_fetch_started', {
      sourceUrl: 'https://example.com/guide.md',
    });

    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining('"event":"source_fetch_started"'),
    );
  });
});
