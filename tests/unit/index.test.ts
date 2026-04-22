import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CliOutput } from "../../src/interfaces/cli/main.js";

const mocks = vi.hoisted(() => {
  const output = {
    cancel: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    intro: vi.fn(),
    outro: vi.fn(),
    progress: vi.fn(),
    step: vi.fn(),
    success: vi.fn(),
  } satisfies CliOutput;
  const promptApi = {
    promptMultiSelect: vi.fn(),
    promptSelect: vi.fn(),
    promptText: vi.fn(),
  };
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
  };
  const quizGenerator = {
    generate: vi.fn(),
  };
  const agentQuizGenerator = {
    generate: vi.fn(),
  };
  const quizSessionRepository = {
    saveSession: vi.fn(),
  };
  const runQuizSession = {
    complete: vi.fn(),
    prepare: vi.fn(),
  };
  const database = { kind: "database" };

  return {
    createClackOutput: vi.fn(() => output),
    createClackPromptApi: vi.fn(() => promptApi),
    createCliLogger: vi.fn(() => logger),
    createOpenRouterAgentQuizGenerator: vi.fn(() => agentQuizGenerator),
    createOpenRouterQuizGenerator: vi.fn(() => quizGenerator),
    createQuizGenerator: vi.fn(() => quizGenerator),
    createPersistenceKnex: vi.fn<() => Promise<any>>(async () => database),
    createRunQuizSession: vi.fn(() => runQuizSession),
    destroyPersistenceKnex: vi.fn(async () => undefined),
    fetchMarkdown: vi.fn(),
    formatStartupError: vi.fn(() => "startup failure"),
    KnexQuizSessionRepository: vi.fn(function KnexQuizSessionRepository() {
      return quizSessionRepository;
    }),
    loadDatabaseEnv: vi.fn(() => ({ path: "./quiz.db" })),
    loadEnv: vi.fn(() => ({
      database: { path: "./quiz.db" },
      quiz: { agentMode: "auto" },
      provider: { apiKey: "openrouter-key", model: "openai/gpt-4.1-mini" },
      limits: {},
    })),
    migrateToLatest: vi.fn(async () => undefined),
    output,
    promptApi,
    quizGenerator,
    quizSessionRepository,
    listSavedSessions: vi.fn<() => Promise<any[]>>(async () => []),
    readLastSession: vi.fn<() => Promise<any>>(async () => null),
    renderLastSession: vi.fn(() => ["session line 1", "session line 2"]),
    renderNoSavedSessions: vi.fn(() => "No sessions yet."),
    renderSavedSessionList: vi.fn(() => ["list line 1", "list line 2"]),
    renderHelpLines: vi.fn(() => ["help line 1", "help line 2"]),
    runCli: vi.fn(async () => 0),
    runQuizSession,
    shouldEnableCliDebugLogs: vi.fn(() => false),
    logger,
    database,
    agentQuizGenerator,
  };
});

vi.mock(
  "../../src/application/read-last-session.js",
  () =>
    ({
      listSavedSessions: mocks.listSavedSessions,
      readLastSession: mocks.readLastSession,
    }) as any,
);

vi.mock(
  "../../src/application/run-quiz-session.js",
  () =>
    ({
      createRunQuizSession: mocks.createRunQuizSession,
    }) as any,
);

vi.mock(
  "../../src/config/env.js",
  () =>
    ({
      loadDatabaseEnv: mocks.loadDatabaseEnv,
      loadEnv: mocks.loadEnv,
    }) as any,
);

vi.mock(
  "../../src/infrastructure/llm/agent/generate-quiz-agent.js",
  () =>
    ({
      createOpenRouterAgentQuizGenerator:
        mocks.createOpenRouterAgentQuizGenerator,
    }) as any,
);

vi.mock(
  "../../src/infrastructure/llm/create-quiz-generator.js",
  () =>
    ({
      createQuizGenerator: mocks.createQuizGenerator,
    }) as any,
);

vi.mock(
  "../../src/infrastructure/llm/generate-quiz.js",
  () =>
    ({
      createOpenRouterQuizGenerator: mocks.createOpenRouterQuizGenerator,
    }) as any,
);

vi.mock(
  "../../src/infrastructure/logger.js",
  () =>
    ({
      createCliLogger: mocks.createCliLogger,
      shouldEnableCliDebugLogs: mocks.shouldEnableCliDebugLogs,
    }) as any,
);

vi.mock(
  "../../src/infrastructure/markdown/fetch-markdown.js",
  () =>
    ({
      fetchMarkdown: mocks.fetchMarkdown,
    }) as any,
);

vi.mock(
  "../../src/infrastructure/persistence/knex.js",
  () =>
    ({
      createPersistenceKnex: mocks.createPersistenceKnex,
      destroyPersistenceKnex: mocks.destroyPersistenceKnex,
      migrateToLatest: mocks.migrateToLatest,
    }) as any,
);

vi.mock(
  "../../src/infrastructure/persistence/quiz-session-repository.js",
  () =>
    ({
      KnexQuizSessionRepository: mocks.KnexQuizSessionRepository,
    }) as any,
);

vi.mock(
  "../../src/interfaces/cli/main.js",
  () =>
    ({
      createClackOutput: mocks.createClackOutput,
      createClackPromptApi: mocks.createClackPromptApi,
      formatStartupError: mocks.formatStartupError,
      runCli: mocks.runCli,
    }) as any,
);

vi.mock(
  "../../src/interfaces/cli/render-last-session.js",
  () =>
    ({
      renderLastSession: mocks.renderLastSession,
      renderNoSavedSessions: mocks.renderNoSavedSessions,
      renderSavedSessionList: mocks.renderSavedSessionList,
    }) as any,
);

describe("runCliCommand", () => {
  const originalArgv = process.argv.slice();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.argv = ["node", "/tmp/test-runner.js"];
  });

  afterEach(() => {
    process.argv = originalArgv.slice();
  });

  it("wires the normal CLI path and cleans up the database connection", async () => {
    const { runCliCommand } = await import("../../src/index.js");

    await expect(runCliCommand()).resolves.toBe(0);

    expect(mocks.loadEnv).toHaveBeenCalledOnce();
    expect(mocks.loadDatabaseEnv).not.toHaveBeenCalled();
    expect(mocks.createPersistenceKnex).toHaveBeenCalledWith("./quiz.db");
    expect(mocks.migrateToLatest).toHaveBeenCalledWith(mocks.database);
    expect(mocks.createOpenRouterQuizGenerator).toHaveBeenCalledWith(
      { apiKey: "openrouter-key", model: "openai/gpt-4.1-mini" },
      { logger: mocks.logger },
    );
    expect(mocks.createOpenRouterAgentQuizGenerator).toHaveBeenCalledWith(
      { apiKey: "openrouter-key", model: "openai/gpt-4.1-mini" },
      { logger: mocks.logger },
    );
    expect(mocks.createQuizGenerator).toHaveBeenCalledWith({
      agentGenerator: mocks.agentQuizGenerator,
      agentMode: "auto",
      directGenerator: mocks.quizGenerator,
    });
    expect(mocks.KnexQuizSessionRepository).toHaveBeenCalledWith(
      mocks.database,
    );
    expect(mocks.createRunQuizSession).toHaveBeenCalledWith({
      fetchMarkdown: mocks.fetchMarkdown,
      logger: mocks.logger,
      quizGenerator: mocks.quizGenerator,
      quizSessionRepository: mocks.quizSessionRepository,
    });
    expect(mocks.runCli).toHaveBeenCalledWith({
      debugLogsEnabled: false,
      output: mocks.output,
      promptApi: mocks.promptApi,
      providerModel: "openai/gpt-4.1-mini",
      runQuizSession: mocks.runQuizSession,
    });
    expect(mocks.destroyPersistenceKnex).toHaveBeenCalledWith(mocks.database);
  });

  it("passes --source-url through to the interactive CLI without prompting first in the entrypoint", async () => {
    process.argv = [
      "node",
      "/tmp/test-runner.js",
      "--source-url",
      "https://example.com/guide.md",
    ];

    const { runCliCommand } = await import("../../src/index.js");

    await expect(runCliCommand()).resolves.toBe(0);

    expect(mocks.runCli).toHaveBeenCalledWith({
      debugLogsEnabled: false,
      initialSourceUrl: "https://example.com/guide.md",
      output: mocks.output,
      promptApi: mocks.promptApi,
      providerModel: "openai/gpt-4.1-mini",
      runQuizSession: mocks.runQuizSession,
    });
  });

  it("renders a startup error when the normal CLI path fails before the database opens", async () => {
    mocks.loadEnv.mockImplementationOnce(() => {
      throw new Error("broken environment config");
    });

    const { runCliCommand } = await import("../../src/index.js");

    await expect(runCliCommand()).resolves.toBe(1);

    expect(mocks.output.error).toHaveBeenCalledWith("startup failure");
    expect(mocks.runCli).not.toHaveBeenCalled();
    expect(mocks.destroyPersistenceKnex).not.toHaveBeenCalled();
  });

  it("prints the no-session message when --last-session is requested without saved data", async () => {
    process.argv = ["node", "/tmp/test-runner.js", "--last-session"];

    const { runCliCommand } = await import("../../src/index.js");

    await expect(runCliCommand()).resolves.toBe(0);

    expect(mocks.loadDatabaseEnv).toHaveBeenCalledOnce();
    expect(mocks.loadEnv).not.toHaveBeenCalled();
    expect(mocks.readLastSession).toHaveBeenCalledWith(mocks.database);
    expect(mocks.renderNoSavedSessions).toHaveBeenCalledOnce();
    expect(mocks.renderLastSession).not.toHaveBeenCalled();
    expect(mocks.runCli).not.toHaveBeenCalled();
    expect(mocks.output.intro).toHaveBeenCalledWith("Last Saved Quiz Session");
    expect(mocks.output.info).toHaveBeenCalledWith("No sessions yet.");
    expect(mocks.output.outro).toHaveBeenCalledWith("Done.");
    expect(mocks.destroyPersistenceKnex).toHaveBeenCalledWith(mocks.database);
  });

  it("renders the most recent session when --last-session is requested and saved data exists", async () => {
    process.argv = ["node", "/tmp/test-runner.js", "--last-session"];
    mocks.readLastSession.mockResolvedValueOnce({
      answers: [],
      createdAt: "2026-04-22T12:00:00.000Z",
      finalScore: 4,
      normalizedSourceUrl: "https://example.com/guide.md",
      sessionId: "session-123",
      sourceTitle: "Guide",
      sourceUrl: "https://example.com/guide.md",
      totalQuestionCount: 5,
    });

    const { runCliCommand } = await import("../../src/index.js");

    await expect(runCliCommand()).resolves.toBe(0);

    expect(mocks.renderLastSession).toHaveBeenCalledWith({
      answers: [],
      createdAt: "2026-04-22T12:00:00.000Z",
      finalScore: 4,
      normalizedSourceUrl: "https://example.com/guide.md",
      sessionId: "session-123",
      sourceTitle: "Guide",
      sourceUrl: "https://example.com/guide.md",
      totalQuestionCount: 5,
    });
    expect(mocks.output.info).toHaveBeenNthCalledWith(1, "session line 1");
    expect(mocks.output.info).toHaveBeenNthCalledWith(2, "session line 2");
    expect(mocks.output.outro).toHaveBeenCalledWith("Read from ./quiz.db.");
  });

  it("renders the saved-session list when --list-sessions is requested", async () => {
    process.argv = ["node", "/tmp/test-runner.js", "--list-sessions"];
    mocks.listSavedSessions.mockResolvedValueOnce([
      {
        createdAt: "2026-04-22T12:00:00.000Z",
        finalScore: 4,
        normalizedSourceUrl: "https://example.com/guide.md",
        sessionId: "session-123",
        sourceTitle: "Guide",
        totalQuestionCount: 5,
      },
    ]);

    const { runCliCommand } = await import("../../src/index.js");

    await expect(runCliCommand()).resolves.toBe(0);

    expect(mocks.listSavedSessions).toHaveBeenCalledWith(mocks.database, 10);
    expect(mocks.renderSavedSessionList).toHaveBeenCalledWith([
      {
        createdAt: "2026-04-22T12:00:00.000Z",
        finalScore: 4,
        normalizedSourceUrl: "https://example.com/guide.md",
        sessionId: "session-123",
        sourceTitle: "Guide",
        totalQuestionCount: 5,
      },
    ]);
    expect(mocks.output.info).toHaveBeenNthCalledWith(1, "list line 1");
    expect(mocks.output.info).toHaveBeenNthCalledWith(2, "list line 2");
    expect(mocks.output.outro).toHaveBeenCalledWith("Read from ./quiz.db.");
  });

  it("renders help output without touching configuration or the database", async () => {
    process.argv = ["node", "/tmp/test-runner.js", "--help"];

    const { runCliCommand, renderHelpLines } =
      await import("../../src/index.js");

    expect(renderHelpLines()).toEqual([
      "Usage: npm run cli -- [options]",
      "Options:",
      "  --help, -h                Show this help message.",
      "  --source-url <url>        Start a quiz without prompting for the source URL first.",
      "  --last-session          Show the most recently saved session.",
      "  --list-sessions         Show the most recent saved sessions.",
      "  --debug, -d               Print provider debug logs during quiz generation.",
    ]);

    await expect(runCliCommand()).resolves.toBe(0);

    expect(mocks.loadEnv).not.toHaveBeenCalled();
    expect(mocks.loadDatabaseEnv).not.toHaveBeenCalled();
    expect(mocks.output.info).toHaveBeenNthCalledWith(
      1,
      "Usage: npm run cli -- [options]",
    );
    expect(mocks.output.outro).toHaveBeenCalledWith("Done.");
  });

  it("shows a direct CLI argument error for a missing --source-url value", async () => {
    process.argv = ["node", "/tmp/test-runner.js", "--source-url"];

    const { runCliCommand } = await import("../../src/index.js");

    await expect(runCliCommand()).resolves.toBe(1);

    expect(mocks.output.error).toHaveBeenCalledWith(
      "Expected a URL after --source-url.",
    );
    expect(mocks.loadEnv).not.toHaveBeenCalled();
  });

  it("renders a startup error when the last-session path fails before a database is available", async () => {
    process.argv = ["node", "/tmp/test-runner.js", "--last-session"];
    mocks.loadDatabaseEnv.mockImplementationOnce(() => {
      throw new Error("broken database config");
    });

    const { runCliCommand } = await import("../../src/index.js");

    await expect(runCliCommand()).resolves.toBe(1);

    expect(mocks.formatStartupError).toHaveBeenCalledWith(expect.any(Error));
    expect(mocks.output.error).toHaveBeenCalledWith("startup failure");
    expect(mocks.destroyPersistenceKnex).not.toHaveBeenCalled();
  });
});
