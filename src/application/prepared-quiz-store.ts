import { randomUUID } from "node:crypto";

import type { Quiz } from "../domain/quiz/types.js";

export interface PreparedQuizSource {
  normalizedUrl: string;
  originalUrl: string;
  title: string | null;
}

export interface StoredPreparedQuizSession {
  quiz: Quiz;
  source: PreparedQuizSource;
}

export interface PreparedQuizStore {
  delete(sessionToken: string): Promise<void>;
  get(sessionToken: string): Promise<StoredPreparedQuizSession | undefined>;
  save(session: StoredPreparedQuizSession): Promise<string>;
}

export function createInMemoryPreparedQuizStore(): PreparedQuizStore {
  const sessions = new Map<string, StoredPreparedQuizSession>();

  return {
    async delete(sessionToken: string): Promise<void> {
      sessions.delete(sessionToken);
    },

    async get(
      sessionToken: string,
    ): Promise<StoredPreparedQuizSession | undefined> {
      return sessions.get(sessionToken);
    },

    async save(session: StoredPreparedQuizSession): Promise<string> {
      const sessionToken = randomUUID();
      sessions.set(sessionToken, session);

      return sessionToken;
    },
  };
}
