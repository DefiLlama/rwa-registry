/**
 * fakeAsk: a prompter that answers by question key, in order for a key asked more than once, and presses enter on the rest.
 * @dev review: src/cli/ask.ts
 */
import type { Ask, Question } from '../../src/cli/ask';

type Answer = string | string[] | boolean;

const LIMIT = 20;

// The answers to one key asked again, as a second deployment's chain.
export const each = (...answers: Answer[]) => ({ each: answers });

export const fakeAsk = (answers: Record<string, Answer | ReturnType<typeof each>> = {}) => {
  const asked: Question[] = [];
  const ask: Ask = async (question) => {
    asked.push(question);
    // A required question is asked again on an empty answer, so a test that leaves one unanswered fails here instead of hanging.
    if (asked.filter(({ key }) => key === question.key).length > LIMIT) {
      throw new Error(`fakeAsk: ${question.key} was asked ${LIMIT} times; give it an answer`);
    }
    const answer = answers[question.key];
    if (answer !== undefined && typeof answer === 'object' && 'each' in answer) {
      return answer.each.shift() ?? question.default ?? '';
    }
    return answer ?? question.default ?? '';
  };
  return { ask, asked, keys: () => asked.map((question) => question.key) };
};
