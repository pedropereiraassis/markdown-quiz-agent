import { fileURLToPath } from "node:url";

import knex, { type Knex } from "knex";

export const SQLITE_MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../../migrations", import.meta.url),
);

export function createSqliteKnexConfig(databasePath: string): Knex.Config {
  return {
    client: "better-sqlite3",
    connection: {
      filename: databasePath,
    },
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 1,
    },
    migrations: {
      directory: SQLITE_MIGRATIONS_DIRECTORY,
      extension: "ts",
      loadExtensions: [".ts"],
    },
  };
}

export async function enableSqlitePragmas(database: Knex): Promise<void> {
  await database.raw("PRAGMA foreign_keys = ON");
}

export async function createPersistenceKnex(
  databasePath: string,
): Promise<Knex> {
  const database = knex(createSqliteKnexConfig(databasePath));

  await enableSqlitePragmas(database);

  return database;
}

export async function migrateToLatest(database: Knex): Promise<void> {
  await database.migrate.latest();
}

export async function destroyPersistenceKnex(database: Knex): Promise<void> {
  await database.destroy();
}
