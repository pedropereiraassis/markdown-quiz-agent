import { loadDatabaseEnv } from "../../config/env.js";
import {
  createPersistenceKnex,
  destroyPersistenceKnex,
  migrateToLatest,
} from "./knex.js";

const databaseEnv = loadDatabaseEnv();
const database = await createPersistenceKnex(databaseEnv.path);

try {
  await migrateToLatest(database);
  console.log(`Applied SQLite migrations to ${databaseEnv.path}`);
} finally {
  await destroyPersistenceKnex(database);
}
