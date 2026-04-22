import { quizSchema } from "../../../domain/quiz/schema.js";
import type { Quiz } from "../../../domain/quiz/types.js";
import type { AgentChunkWindow } from "../../markdown/build-agent-chunk-windows.js";

export interface ValidateAgentQuizResult {
  success: boolean;
  issues: string[];
}

export function validateAgentQuiz(
  quiz: Quiz,
  windows: readonly AgentChunkWindow[],
): ValidateAgentQuizResult {
  const schemaResult = quizSchema.safeParse(quiz);

  if (!schemaResult.success) {
    return {
      success: false,
      issues: schemaResult.error.issues.map(
        (issue) => `${issue.path.join(".") || "quiz"}: ${issue.message}`,
      ),
    };
  }

  const sourceTokens = collectTokenSet(
    windows.map((window) => window.text).join("\n\n"),
  );
  const issues: string[] = [];

  schemaResult.data.questions.forEach((question, index) => {
    const promptTokens = collectTokens(question.prompt);
    const hasOverlap = promptTokens.some((token) => sourceTokens.has(token));

    if (!hasOverlap) {
      issues.push(
        `questions.${index}.prompt: question prompt does not overlap with the source windows`,
      );
    }
  });

  return {
    success: issues.length === 0,
    issues,
  };
}

function collectTokens(text: string): string[] {
  return (
    text
      .toLowerCase()
      .match(/[a-z0-9]{4,}/g)
      ?.filter((token) => token.length > 0) ?? []
  );
}

function collectTokenSet(text: string): Set<string> {
  return new Set(collectTokens(text));
}
