import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Knex } from "knex";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  listSavedSessions,
  readLastSession,
} from "../../src/application/read-last-session.js";
import {
  createPersistenceKnex,
  destroyPersistenceKnex,
  migrateToLatest,
} from "../../src/infrastructure/persistence/knex.js";
import {
  buildQuizAnswerInsertRows,
  buildQuizSessionInsertRow,
  type PersistQuizSessionInput,
} from "../../src/infrastructure/persistence/quiz-session-repository.js";
import {
  createMultipleQuestion,
  createSingleQuestion,
} from "../support/quiz-fixtures.js";

function createPersistedSession(
  sessionId: string,
  createdAt: string,
  overrides: Partial<PersistQuizSessionInput> = {},
): {
  answers: ReturnType<typeof buildQuizAnswerInsertRows>;
  session: ReturnType<typeof buildQuizSessionInsertRow>;
} {
  const singleQuestion = createSingleQuestion(`${sessionId}-q1`);
  const multipleQuestion = createMultipleQuestion(`${sessionId}-q2`, [
    `${sessionId}-q2-a`,
    `${sessionId}-q2-d`,
  ]);
  const input: PersistQuizSessionInput = {
    sourceUrl: `https://example.com/${sessionId}.md`,
    normalizedSourceUrl: `https://example.com/${sessionId}.md`,
    sourceTitle: `Source ${sessionId}`,
    totalQuestionCount: 2,
    finalScore: 3.125,
    answers: [
      {
        questionId: singleQuestion.id,
        questionOrder: 1,
        questionType: singleQuestion.type,
        questionTextSnapshot: singleQuestion.prompt,
        optionSnapshot: singleQuestion.options,
        correctOptionIds: singleQuestion.correctOptionIds,
        selectedOptionIds: [singleQuestion.correctOptionIds[0]!],
        pointsAwarded: 4,
        weightApplied: 1,
      },
      {
        questionId: multipleQuestion.id,
        questionOrder: 2,
        questionType: multipleQuestion.type,
        questionTextSnapshot: multipleQuestion.prompt,
        optionSnapshot: multipleQuestion.options,
        correctOptionIds: multipleQuestion.correctOptionIds,
        selectedOptionIds: [
          multipleQuestion.correctOptionIds[0]!,
          `${sessionId}-q2-b`,
        ],
        pointsAwarded: 2,
        weightApplied: 1.1,
      },
    ],
    ...overrides,
  };

  return {
    session: buildQuizSessionInsertRow(input, sessionId, createdAt),
    answers: buildQuizAnswerInsertRows(input, sessionId),
  };
}

describe("readLastSession integration", () => {
  let database: Knex | undefined;
  let databaseDirectory: string | undefined;

  beforeEach(async () => {
    databaseDirectory = await mkdtemp(
      path.join(tmpdir(), "markdown-quiz-agent-read-last-session-"),
    );
    database = await createPersistenceKnex(
      path.join(databaseDirectory, "quiz.sqlite"),
    );
    await migrateToLatest(database);
  });

  afterEach(async () => {
    if (database) {
      await destroyPersistenceKnex(database);
    }

    if (databaseDirectory) {
      await rm(databaseDirectory, { force: true, recursive: true });
    }
  });

  it("returns null when no session has been persisted yet", async () => {
    const databaseConnection = database;

    expect(databaseConnection).toBeDefined();

    if (!databaseConnection) {
      throw new Error(
        "Expected SQLite database to be initialized for the test",
      );
    }

    await expect(readLastSession(databaseConnection)).resolves.toBeNull();
  });

  it("reads back the most recently saved session and parses answer snapshots", async () => {
    const databaseConnection = database;

    expect(databaseConnection).toBeDefined();

    if (!databaseConnection) {
      throw new Error(
        "Expected SQLite database to be initialized for the test",
      );
    }

    const olderSession = createPersistedSession(
      "session-older",
      "2026-04-22T08:00:00.000Z",
    );
    const newerSession = createPersistedSession(
      "session-newer",
      "2026-04-22T09:00:00.000Z",
      {
        finalScore: 2.75,
        sourceTitle: null,
      },
    );

    await databaseConnection("quiz_sessions").insert([
      olderSession.session,
      newerSession.session,
    ]);
    await databaseConnection("quiz_answers").insert([
      ...olderSession.answers,
      ...newerSession.answers,
    ]);

    const lastSession = await readLastSession(databaseConnection);

    expect(lastSession).toEqual({
      sessionId: "session-newer",
      sourceUrl: "https://example.com/session-newer.md",
      normalizedSourceUrl: "https://example.com/session-newer.md",
      sourceTitle: null,
      totalQuestionCount: 2,
      finalScore: 2.75,
      createdAt: "2026-04-22T09:00:00.000Z",
      answers: [
        {
          questionId: "session-newer-q1",
          questionOrder: 1,
          questionType: "single",
          questionText: "Prompt for session-newer-q1",
          options: [
            {
              id: "session-newer-q1-a",
              label: "Option A for session-newer-q1",
            },
            {
              id: "session-newer-q1-b",
              label: "Option B for session-newer-q1",
            },
            {
              id: "session-newer-q1-c",
              label: "Option C for session-newer-q1",
            },
            {
              id: "session-newer-q1-d",
              label: "Option D for session-newer-q1",
            },
          ],
          correctOptionIds: ["session-newer-q1-a"],
          selectedOptionIds: ["session-newer-q1-a"],
          pointsAwarded: 4,
          weightApplied: 1,
        },
        {
          questionId: "session-newer-q2",
          questionOrder: 2,
          questionType: "multiple",
          questionText: "Prompt for session-newer-q2",
          options: [
            {
              id: "session-newer-q2-a",
              label: "Option A for session-newer-q2",
            },
            {
              id: "session-newer-q2-b",
              label: "Option B for session-newer-q2",
            },
            {
              id: "session-newer-q2-c",
              label: "Option C for session-newer-q2",
            },
            {
              id: "session-newer-q2-d",
              label: "Option D for session-newer-q2",
            },
          ],
          correctOptionIds: ["session-newer-q2-a", "session-newer-q2-d"],
          selectedOptionIds: ["session-newer-q2-a", "session-newer-q2-b"],
          pointsAwarded: 2,
          weightApplied: 1.1,
        },
      ],
    });
  });

  it("lists the most recent sessions in descending saved order", async () => {
    const databaseConnection = database;

    expect(databaseConnection).toBeDefined();

    if (!databaseConnection) {
      throw new Error(
        "Expected SQLite database to be initialized for the test",
      );
    }

    const olderSession = createPersistedSession(
      "session-older",
      "2026-04-22T08:00:00.000Z",
    );
    const newerSession = createPersistedSession(
      "session-newer",
      "2026-04-22T09:00:00.000Z",
      {
        finalScore: 2.75,
        sourceTitle: null,
      },
    );

    await databaseConnection("quiz_sessions").insert([
      olderSession.session,
      newerSession.session,
    ]);

    await expect(listSavedSessions(databaseConnection)).resolves.toEqual([
      {
        createdAt: "2026-04-22T09:00:00.000Z",
        finalScore: 2.75,
        normalizedSourceUrl: "https://example.com/session-newer.md",
        sessionId: "session-newer",
        sourceTitle: null,
        totalQuestionCount: 2,
      },
      {
        createdAt: "2026-04-22T08:00:00.000Z",
        finalScore: 3.125,
        normalizedSourceUrl: "https://example.com/session-older.md",
        sessionId: "session-older",
        sourceTitle: "Source session-older",
        totalQuestionCount: 2,
      },
    ]);
  });
});
