import type { QuizAgentMode } from "../../config/constants.js";
import type { GenerateQuizInput, QuizGenerator } from "./generate-quiz.js";

export interface CreateQuizGeneratorOptions {
  agentGenerator: QuizGenerator;
  agentMode: QuizAgentMode;
  directGenerator: QuizGenerator;
}

export function createQuizGenerator(
  options: CreateQuizGeneratorOptions,
): QuizGenerator {
  return {
    generate(input: GenerateQuizInput) {
      return selectGenerator(options, input).generate(input);
    },
  };
}

function selectGenerator(
  options: CreateQuizGeneratorOptions,
  input: GenerateQuizInput,
): QuizGenerator {
  if (options.agentMode === "always") {
    return options.agentGenerator;
  }

  if (options.agentMode === "off") {
    return options.directGenerator;
  }

  return input.source.wasTruncated
    ? options.agentGenerator
    : options.directGenerator;
}
