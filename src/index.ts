import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRunQuizSession } from './application/run-quiz-session.js';
import { loadEnv } from './config/env.js';
import { createOpenRouterQuizGenerator } from './infrastructure/llm/generate-quiz.js';
import { createCliLogger, shouldEnableCliDebugLogs } from './infrastructure/logger.js';
import { fetchMarkdown } from './infrastructure/markdown/fetch-markdown.js';
import {
  createPersistenceKnex,
  destroyPersistenceKnex,
  migrateToLatest,
} from './infrastructure/persistence/knex.js';
import { KnexQuizSessionRepository } from './infrastructure/persistence/quiz-session-repository.js';
import {
  createClackOutput,
  createClackPromptApi,
  formatStartupError,
  runCli,
} from './interfaces/cli/main.js';

export * from './application/index.js';
export * from './config/index.js';
export * from './domain/index.js';

export async function runCliCommand(): Promise<number> {
  const output = createClackOutput();
  const cliArgs = process.argv.slice(2);
  let database: Awaited<ReturnType<typeof createPersistenceKnex>> | undefined;

  try {
    const env = loadEnv();

    database = await createPersistenceKnex(env.database.path);
    await migrateToLatest(database);

    const debugLogsEnabled = shouldEnableCliDebugLogs(process.env, cliArgs);
    const logger = createCliLogger(process.env, cliArgs);
    const runQuizSession = createRunQuizSession({
      fetchMarkdown,
      logger,
      quizGenerator: createOpenRouterQuizGenerator(
        { apiKey: env.provider.apiKey, model: env.provider.model },
        { logger },
      ),
      quizSessionRepository: new KnexQuizSessionRepository(database),
    });

    return await runCli({
      debugLogsEnabled,
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
