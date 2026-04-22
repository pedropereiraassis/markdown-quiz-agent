import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("quiz_sessions", (table) => {
    table.text("id").primary();
    table.text("source_url").notNullable();
    table.text("normalized_source_url").notNullable();
    table.text("source_title").nullable();
    table.integer("total_question_count").notNullable();
    table.float("final_score").notNullable();
    table.text("created_at").notNullable();
  });

  await knex.schema.createTable("quiz_answers", (table) => {
    table.text("id").primary();
    table.text("session_id").notNullable();
    table.text("question_id").notNullable();
    table.integer("question_order").notNullable();
    table.text("question_type").notNullable();
    table.text("question_text_snapshot").notNullable();
    table.text("option_snapshot_json").notNullable();
    table.text("correct_option_ids_json").notNullable();
    table.text("selected_option_ids_json").notNullable();
    table.float("points_awarded").notNullable();
    table.float("weight_applied").notNullable();

    table
      .foreign("session_id")
      .references("quiz_sessions.id")
      .onDelete("CASCADE");
    table.unique(["session_id", "question_order"]);
    table.index(["session_id", "question_order"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("quiz_answers");
  await knex.schema.dropTableIfExists("quiz_sessions");
}
