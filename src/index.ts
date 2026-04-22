import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  listSavedSessions,
  readLastSession,
} from "./application/read-last-session.js";
import { createRunQuizSession } from "./application/run-quiz-session.js";
import { loadDatabaseEnv, loadEnv } from "./config/env.js";
import { createQuizGenerator } from "./infrastructure/llm/create-quiz-generator.js";
import { createOpenRouterAgentQuizGenerator } from "./infrastructure/llm/agent/generate-quiz-agent.js";
import { createOpenRouterQuizGenerator } from "./infrastructure/llm/generate-quiz.js";
import {
  createCliLogger,
  shouldEnableCliDebugLogs,
} from "./infrastructure/logger.js";
import { fetchMarkdown } from "./infrastructure/markdown/fetch-markdown.js";
import {
  createPersistenceKnex,
  destroyPersistenceKnex,
  migrateToLatest,
} from "./infrastructure/persistence/knex.js";
import { KnexQuizSessionRepository } from "./infrastructure/persistence/quiz-session-repository.js";
import {
  createClackOutput,
  createClackPromptApi,
  formatStartupError,
  runCli,
} from "./interfaces/cli/main.js";
import {
  renderLastSession,
  renderNoSavedSessions,
  renderSavedSessionList,
} from "./interfaces/cli/render-last-session.js";

export * from "./application/index.js";
export * from "./config/index.js";
export * from "./domain/index.js";

const LAST_SESSION_FLAG = "--last-session";
const LIST_SESSIONS_FLAG = "--list-sessions";
const SOURCE_URL_FLAG = "--source-url";
const HELP_FLAGS = new Set(["--help", "-h"]);
const DEFAULT_LIST_SESSIONS_LIMIT = 10;

export interface ParsedCliArgs {
  showHelp: boolean;
  showLastSession: boolean;
  showListSessions: boolean;
  sourceUrl?: string;
}

class CliArgumentError extends Error {
  override readonly name = "CliArgumentError";
}

export async function runCliCommand(): Promise<number> {
  const output = createClackOutput();
  const cliArgs = process.argv.slice(2);
  let parsedArgs: ParsedCliArgs;

  try {
    parsedArgs = parseCliArgs(cliArgs);
  } catch (error) {
    if (error instanceof CliArgumentError) {
      output.error(error.message);
      return 1;
    }

    output.error(formatStartupError(error));
    return 1;
  }

  if (parsedArgs.showHelp) {
    return runShowHelpCommand(output);
  }

  if (parsedArgs.showLastSession) {
    return runShowLastSessionCommand(output);
  }

  if (parsedArgs.showListSessions) {
    return runListSessionsCommand(output);
  }

  let database: Awaited<ReturnType<typeof createPersistenceKnex>> | undefined;

  try {
    const env = loadEnv();

    database = await createPersistenceKnex(env.database.path);
    await migrateToLatest(database);

    const debugLogsEnabled = shouldEnableCliDebugLogs(process.env, cliArgs);
    const logger = createCliLogger(process.env, cliArgs);
    const directQuizGenerator = createOpenRouterQuizGenerator(
      { apiKey: env.provider.apiKey, model: env.provider.model },
      { logger },
    );
    const agentQuizGenerator = createOpenRouterAgentQuizGenerator(
      { apiKey: env.provider.apiKey, model: env.provider.model },
      { logger },
    );
    const runQuizSession = createRunQuizSession({
      fetchMarkdown,
      logger,
      quizGenerator: createQuizGenerator({
        agentGenerator: agentQuizGenerator,
        agentMode: env.quiz.agentMode,
        directGenerator: directQuizGenerator,
      }),
      quizSessionRepository: new KnexQuizSessionRepository(database),
    });

    return await runCli({
      debugLogsEnabled,
      ...(parsedArgs.sourceUrl
        ? { initialSourceUrl: parsedArgs.sourceUrl }
        : {}),
      output,
      promptApi: createClackPromptApi(),
      providerModel: env.provider.model,
      runQuizSession,
    });
  } catch (error) {
    output.error(formatStartupError(error));
    return 1;
  } finally {
    if (database) {
      await destroyPersistenceKnex(database);
    }
  }
}

export function parseCliArgs(cliArgs: string[]): ParsedCliArgs {
  let sourceUrl: string | undefined;
  let showHelp = false;
  let showLastSession = false;
  let showListSessions = false;

  for (let index = 0; index < cliArgs.length; index += 1) {
    const argument = cliArgs[index];

    if (!argument) {
      continue;
    }

    if (HELP_FLAGS.has(argument)) {
      showHelp = true;
      continue;
    }

    if (argument === LAST_SESSION_FLAG) {
      showLastSession = true;
      continue;
    }

    if (argument === LIST_SESSIONS_FLAG) {
      showListSessions = true;
      continue;
    }

    if (argument === SOURCE_URL_FLAG) {
      const value = cliArgs[index + 1];

      if (!value || value.startsWith("--")) {
        throw new CliArgumentError(`Expected a URL after ${SOURCE_URL_FLAG}.`);
      }

      sourceUrl = value;
      index += 1;
      continue;
    }

    if (argument.startsWith(`${SOURCE_URL_FLAG}=`)) {
      const value = argument.slice(`${SOURCE_URL_FLAG}=`.length).trim();

      if (value.length === 0) {
        throw new CliArgumentError(`Expected a URL after ${SOURCE_URL_FLAG}.`);
      }

      sourceUrl = value;
    }
  }

  if (showLastSession && showListSessions) {
    throw new CliArgumentError(
      `Choose only one of ${LAST_SESSION_FLAG} or ${LIST_SESSIONS_FLAG}.`,
    );
  }

  return {
    showHelp,
    showLastSession,
    showListSessions,
    ...(sourceUrl ? { sourceUrl } : {}),
  };
}

async function runShowLastSessionCommand(
  output: ReturnType<typeof createClackOutput>,
): Promise<number> {
  let database: Awaited<ReturnType<typeof createPersistenceKnex>> | undefined;

  try {
    const env = loadDatabaseEnv();
    database = await createPersistenceKnex(env.path);
    await migrateToLatest(database);

    const session = await readLastSession(database);

    output.intro("Last Saved Quiz Session");

    if (!session) {
      output.info(renderNoSavedSessions());
      output.outro("Done.");
      return 0;
    }

    for (const line of renderLastSession(session)) {
      output.info(line);
    }

    output.outro(`Read from ${env.path}.`);
    return 0;
  } catch (error) {
    output.error(formatStartupError(error));
    return 1;
  } finally {
    if (database) {
      await destroyPersistenceKnex(database);
    }
  }
}

async function runListSessionsCommand(
  output: ReturnType<typeof createClackOutput>,
): Promise<number> {
  let database: Awaited<ReturnType<typeof createPersistenceKnex>> | undefined;

  try {
    const env = loadDatabaseEnv();
    database = await createPersistenceKnex(env.path);
    await migrateToLatest(database);

    const sessions = await listSavedSessions(
      database,
      DEFAULT_LIST_SESSIONS_LIMIT,
    );

    output.intro("Saved Quiz Sessions");

    if (sessions.length === 0) {
      output.info(renderNoSavedSessions());
      output.outro("Done.");
      return 0;
    }

    for (const line of renderSavedSessionList(sessions)) {
      output.info(line);
    }

    output.outro(`Read from ${env.path}.`);
    return 0;
  } catch (error) {
    output.error(formatStartupError(error));
    return 1;
  } finally {
    if (database) {
      await destroyPersistenceKnex(database);
    }
  }
}

function runShowHelpCommand(
  output: ReturnType<typeof createClackOutput>,
): number {
  output.intro("Markdown Quiz");

  for (const line of renderHelpLines()) {
    output.info(line);
  }

  output.outro("Done.");
  return 0;
}

export function renderHelpLines(): string[] {
  return [
    "Usage: npm run cli -- [options]",
    "Options:",
    "  --help, -h                Show this help message.",
    "  --source-url <url>        Start a quiz without prompting for the source URL first.",
    `  ${LAST_SESSION_FLAG}          Show the most recently saved session.`,
    `  ${LIST_SESSIONS_FLAG}         Show the most recent saved sessions.`,
    "  --debug, -d               Print provider debug logs during quiz generation.",
  ];
}

function isExecutedDirectly(moduleUrl: string): boolean {
  const entryPath = process.argv[1];

  if (!entryPath) {
    return false;
  }

  return path.resolve(entryPath) === fileURLToPath(moduleUrl);
}

if (isExecutedDirectly(import.meta.url)) {
  process.exitCode = await runCliCommand();
}
