/**
 * Ask: the seam every question of a command crosses; askInTerminal asks it with @inquirer/prompts.
 * @dev review: src/cli/questionnaire.ts
 */
import { checkbox, confirm, input, search, select } from '@inquirer/prompts';

// A choice shows its name and answers its value, as an organization shows its name and answers its slug.
export type Choice = string | { value: string; name: string };

export interface Question {
  key: string;
  message: string;
  choices?: Choice[];
  list?: boolean;
  default?: string | string[] | boolean;
  // An empty answer skips the field.
  optional?: boolean;
  // The choices are suggestions, and any typed text is an answer, as a chain the registry has not seen yet.
  open?: boolean;
  confirm?: boolean;
  date?: boolean;
}

export type Ask = (question: Question) => Promise<string | string[] | boolean>;

const SKIP = { value: '', name: '(skip)' };

// A day, or unknown for one left out on purpose.
const isDay = (text: string) =>
  text === '' || text === 'unknown' || /^\d{4}-\d{2}-\d{2}$/.test(text) || 'a day is YYYY-MM-DD, or unknown';

export const askInTerminal: Ask = async (question) => {
  const { message, choices, list, optional, open } = question;
  if (question.confirm) return confirm({ message, default: question.default === true });
  const fallback = typeof question.default === 'string' ? question.default : undefined;
  if (!choices?.length) {
    return input({ message, default: fallback, required: !optional, validate: question.date ? isDay : undefined });
  }
  const options = choices.map((choice) => (typeof choice === 'string' ? { value: choice, name: choice } : choice));
  if (list) {
    const picked = new Set([question.default].flat());
    return checkbox({ message, choices: options.map((option) => ({ ...option, checked: picked.has(option.value) })) });
  }
  const skippable = optional ? [SKIP, ...options] : options;
  if (options.length <= 20 && !open) return select({ message, choices: skippable, default: fallback });
  // A long list, such as the organizations, is filtered by what the person types; an open list also offers the text itself.
  const matching = (term = '') => {
    const found = skippable.filter(({ name }) => name.toLowerCase().includes(term.toLowerCase()));
    return open && term && !found.some(({ value }) => value === term) ? [{ value: term, name: term }, ...found] : found;
  };
  return search({
    message: fallback ? `${message} (${fallback})` : message,
    source: (term) => matching(term ?? fallback),
  });
};
