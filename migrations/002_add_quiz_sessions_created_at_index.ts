import type { Knex } from "knex";

const INDEX_NAME = "quiz_sessions_created_at_index";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("quiz_sessions", (table) => {
    table.index(["created_at"], INDEX_NAME);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("quiz_sessions", (table) => {
    table.dropIndex(["created_at"], INDEX_NAME);
  });
}
