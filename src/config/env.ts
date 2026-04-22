import { config as loadDotenv } from "dotenv";
import { z } from "zod";

import { FETCH_LIMITS, PROVIDER_RULES } from "./constants.js";

const trimmedRequiredString = z.string().trim().min(1);

const databasePathSchema = trimmedRequiredString.refine(
  (value) =>
    value !== ":memory:" && !value.endsWith("/") && !value.endsWith("\\"),
  {
    message:
      'DATABASE_PATH must be a SQLite file path and cannot be ":memory:" or a directory path',
  },
);

const envSchema = z.object({
  OPENROUTER_API_KEY: trimmedRequiredString,
  OPENROUTER_MODEL: trimmedRequiredString.refine(
    (value) => value !== PROVIDER_RULES.disallowedModelId,
    {
      message: `OPENROUTER_MODEL must be a pinned model id and cannot be "${PROVIDER_RULES.disallowedModelId}"`,
    },
  ),
  DATABASE_PATH: databasePathSchema,
});

const databaseEnvSchema = z.object({
  DATABASE_PATH: databasePathSchema,
});

export interface AppEnv {
  provider: {
    name: typeof PROVIDER_RULES.openRouterProvider;
    apiKey: string;
    model: string;
  };
  database: {
    path: string;
  };
  limits: typeof FETCH_LIMITS;
}

export interface DatabaseEnv {
  path: string;
}

export function parseEnv(rawEnv: Record<string, string | undefined>): AppEnv {
  const parsed = envSchema.safeParse(rawEnv);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  const { OPENROUTER_API_KEY, OPENROUTER_MODEL, DATABASE_PATH } = parsed.data;

  return {
    provider: {
      name: PROVIDER_RULES.openRouterProvider,
      apiKey: OPENROUTER_API_KEY,
      model: OPENROUTER_MODEL,
    },
    database: {
      path: DATABASE_PATH,
    },
    limits: FETCH_LIMITS,
  };
}

export function parseDatabaseEnv(
  rawEnv: Record<string, string | undefined>,
): DatabaseEnv {
  const parsed = databaseEnvSchema.safeParse(rawEnv);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid database configuration: ${issues}`);
  }

  return {
    path: parsed.data.DATABASE_PATH,
  };
}

export function loadEnv(): AppEnv {
  loadDotenv({ quiet: true });

  return parseEnv(process.env);
}

export function loadDatabaseEnv(): DatabaseEnv {
  loadDotenv();

  return parseDatabaseEnv(process.env);
}
