import type { PreparedQuizQuestion } from '../../application/run-quiz-session.js';
import type { QuestionAnswer } from '../../domain/quiz/types.js';

export interface AnswerChoice {
  label: string;
  value: string;
}

export interface AnswerPromptApi {
  promptMultiSelect(options: MultipleChoicePromptOptions): Promise<string[]>;
  promptSelect(options: SingleChoicePromptOptions): Promise<string>;
}

export interface SingleChoicePromptOptions {
  message: string;
  options: AnswerChoice[];
}

export interface MultipleChoicePromptOptions {
  message: string;
  options: AnswerChoice[];
  required: boolean;
}

export function buildQuestionPromptMessage(
  question: PreparedQuizQuestion,
  questionOrder: number,
  totalQuestionCount: number,
): string {
  const heading = `Question ${questionOrder} of ${totalQuestionCount}`;

  if (question.type === 'multiple') {
    return `${heading}\nMultiple-answer question. Select all that apply.\n${question.prompt}`;
  }

  return `${heading}\nSingle-answer question. Select one option.\n${question.prompt}`;
}

export async function promptForQuestion(
  promptApi: AnswerPromptApi,
  question: PreparedQuizQuestion,
  questionOrder: number,
  totalQuestionCount: number,
): Promise<QuestionAnswer> {
  const promptMessage = buildQuestionPromptMessage(question, questionOrder, totalQuestionCount);
  const options = question.options.map((option) => ({
    label: option.label,
    value: option.id,
  }));

  if (question.type === 'multiple') {
    const selectedOptionIds = await promptApi.promptMultiSelect({
      message: promptMessage,
      options,
      required: true,
    });

    return {
      questionId: question.id,
      selectedOptionIds,
    };
  }

  const selectedOptionId = await promptApi.promptSelect({
    message: promptMessage,
    options,
  });

  return {
    questionId: question.id,
    selectedOptionIds: [selectedOptionId],
  };
}

export async function promptForAnswers(
  promptApi: AnswerPromptApi,
  questions: PreparedQuizQuestion[],
): Promise<QuestionAnswer[]> {
  const answers: QuestionAnswer[] = [];

  for (const [index, question] of questions.entries()) {
    answers.push(await promptForQuestion(promptApi, question, index + 1, questions.length));
  }

  return answers;
}
