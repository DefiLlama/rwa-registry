/**
 * fakeAsk: a prompter that answers by question key, in order for a key asked more than once, and presses enter on the rest.
 * @dev review: src/cli/ask.ts
 */
import type { Ask, Question } from '../../src/cli/ask';

type Answer = string | string[] | boolean;

// The answers to one key asked again, as a second deployment's chain.
export const each = (...answers: Answer[]) => ({ each: answers });

export const fakeAsk = (answers: Record<string, Answer | ReturnType<typeof each>> = {}) => {
  const asked: Question[] = [];
  const ask: Ask = async (question) => {
    asked.push(question);
    const answer = answers[question.key];
    if (answer !== undefined && typeof answer === 'object' && 'each' in answer) {
      return answer.each.shift() ?? question.default ?? '';
    }
    return answer ?? question.default ?? '';
  };
  return { ask, asked, keys: () => asked.map((question) => question.key) };
};
