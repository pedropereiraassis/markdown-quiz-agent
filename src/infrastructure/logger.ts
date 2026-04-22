export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export const CLI_DEBUG_LOGS_ENV_VAR = 'QUIZ_DEBUG_LOGS';
export const CLI_DEBUG_LOGS_FLAG = '--debug';
export const CLI_DEBUG_LOGS_SHORT_FLAG = '-d';

export function createConsoleLogger(): Logger {
  return {
    info(event, fields = {}) {
      process.stdout.write(JSON.stringify({ event, level: 'info', ...fields }) + '\n');
    },
    error(event, fields = {}) {
      process.stderr.write(JSON.stringify({ event, level: 'error', ...fields }) + '\n');
    },
  };
}

export function createNoopLogger(): Logger {
  return {
    info() {},
    error() {},
  };
}

export function shouldEnableCliDebugLogs(
  rawEnv: Record<string, string | undefined> = process.env,
  argv: string[] = process.argv.slice(2),
): boolean {
  const value = rawEnv[CLI_DEBUG_LOGS_ENV_VAR]?.trim().toLowerCase();
  const envEnabled =
    value === '1' || value === 'true' || value === 'yes' || value === 'on';
  const argEnabled = argv.some(
    (argument) =>
      argument === CLI_DEBUG_LOGS_FLAG || argument === CLI_DEBUG_LOGS_SHORT_FLAG,
  );

  return envEnabled || argEnabled;
}

export function createCliLogger(
  rawEnv: Record<string, string | undefined> = process.env,
  argv: string[] = process.argv.slice(2),
): Logger {
  return shouldEnableCliDebugLogs(rawEnv, argv) ? createConsoleLogger() : createNoopLogger();
}
