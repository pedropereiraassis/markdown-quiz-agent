import { describe, expect, it } from "vitest";

import { FETCH_LIMITS } from "../../../src/config/constants.js";
import { parseDatabaseEnv, parseEnv } from "../../../src/config/env.js";

function createRawEnv(
  overrides: Partial<Record<string, string | undefined>> = {},
) {
  return {
    OPENROUTER_API_KEY: "test-key",
    OPENROUTER_MODEL: "openai/gpt-4.1-mini",
    DATABASE_PATH: "./data/quiz.sqlite",
    ...overrides,
  };
}

describe("parseEnv", () => {
  it("parses valid OpenRouter and SQLite configuration", () => {
    const env = parseEnv(createRawEnv());

    expect(env.provider).toEqual({
      name: "openrouter",
      apiKey: "test-key",
      model: "openai/gpt-4.1-mini",
    });
    expect(env.database.path).toBe("./data/quiz.sqlite");
    expect(env.quiz.agentMode).toBe("auto");
    expect(env.limits).toBe(FETCH_LIMITS);
  });

  it("parses QUIZ_AGENT_MODE when explicitly provided", () => {
    const env = parseEnv(createRawEnv({ QUIZ_AGENT_MODE: "always" }));

    expect(env.quiz.agentMode).toBe("always");
  });

  it("rejects a missing OpenRouter API key", () => {
    expect(() => parseEnv(createRawEnv({ OPENROUTER_API_KEY: "   " }))).toThrow(
      /OPENROUTER_API_KEY/,
    );
  });

  it("rejects a missing pinned model id", () => {
    expect(() => parseEnv(createRawEnv({ OPENROUTER_MODEL: "" }))).toThrow(
      /OPENROUTER_MODEL/,
    );
  });

  it("rejects openrouter\\/auto as an invalid model id", () => {
    expect(() =>
      parseEnv(createRawEnv({ OPENROUTER_MODEL: "openrouter/auto" })),
    ).toThrow(/pinned model id/);
  });

  it("rejects an empty database path", () => {
    expect(() => parseEnv(createRawEnv({ DATABASE_PATH: " " }))).toThrow(
      /DATABASE_PATH/,
    );
  });

  it("rejects an invalid QUIZ_AGENT_MODE", () => {
    expect(() =>
      parseEnv(createRawEnv({ QUIZ_AGENT_MODE: "sometimes" })),
    ).toThrow(/QUIZ_AGENT_MODE/);
  });

  it("rejects in-memory and directory-style database paths", () => {
    expect(() => parseEnv(createRawEnv({ DATABASE_PATH: ":memory:" }))).toThrow(
      /SQLite file path/,
    );
    expect(() => parseEnv(createRawEnv({ DATABASE_PATH: "./data/" }))).toThrow(
      /SQLite file path/,
    );
  });
});

describe("parseDatabaseEnv", () => {
  it("parses a valid database-only configuration without unrelated provider env vars", () => {
    const database = parseDatabaseEnv({
      DATABASE_PATH: "./data/quiz.sqlite",
    });

    expect(database).toEqual({
      path: "./data/quiz.sqlite",
    });
  });

  it("rejects an invalid database path for migration-only configuration", () => {
    expect(() => parseDatabaseEnv({ DATABASE_PATH: ":memory:" })).toThrow(
      /Invalid database configuration/,
    );
  });
});
