/**
 * Ask: the seam every question of a command crosses; askInTerminal asks it with @inquirer/prompts.
 * @dev review: src/cli/questionnaire.ts
 */
import { checkbox, input, search, select } from '@inquirer/prompts';

// A choice shows its name and answers its value, as an organization shows its name and answers its slug.
export type Choice = string | { value: string; name: string };

export interface Question {
  key: string;
  message: string;
  choices?: Choice[];
  list?: boolean;
  default?: string | string[] | boolean;
  // An empty answer leaves the field empty.
  optional?: boolean;
  // The choices are suggestions, and any typed text is an answer, as a chain the registry has not seen yet.
  open?: boolean;
  // Answered yes or no, Enter taking the default; with no default, Enter leaves it empty.
  confirm?: boolean;
  date?: boolean;
}

export type Ask = (question: Question) => Promise<string | string[] | boolean>;

const EMPTY = { value: '', name: '(leave empty)' };

// A list this long or shorter is shown whole; a longer one is searched by what the person types.
const SHOWN = 50;

const isYesNo = (text: string) => /^(y|yes|n|no)?$/i.test(text.trim()) || 'answer yes or no';

// A day, or unknown for one left out on purpose.
const isDay = (text: string) =>
  text === '' || text === 'unknown' || /^\d{4}-\d{2}-\d{2}$/.test(text) || 'a day is YYYY-MM-DD, or unknown';

export const askInTerminal: Ask = async (question) => {
  const { message, choices, list, optional, open } = question;
  if (question.confirm) {
    const answer = (await input({ message, validate: isYesNo })).trim().toLowerCase();
    if (answer) return answer.startsWith('y');
    return typeof question.default === 'boolean' ? question.default : '';
  }
  const fallback = typeof question.default === 'string' ? question.default : undefined;
  if (!choices?.length) {
    return input({ message, default: fallback, required: !optional, validate: question.date ? isDay : undefined });
  }
  const options = choices.map((choice) => (typeof choice === 'string' ? { value: choice, name: choice } : choice));
  if (list) {
    const picked = new Set([question.default].flat());
    const choices = options.map((option) => ({ ...option, checked: picked.has(option.value) }));
    return checkbox({ message, choices, required: !optional });
  }
  const listed = optional ? [EMPTY, ...options] : options;
  if (options.length <= SHOWN && !open) return select({ message, choices: listed, default: fallback });
  // A long list, such as the organizations, is filtered by what the person types; an open list also offers the text itself.
  const matching = (term = '') => {
    const found = listed.filter(({ name }) => name.toLowerCase().includes(term.toLowerCase()));
    return open && term && !found.some(({ value }) => value === term) ? [{ value: term, name: term }, ...found] : found;
  };
  return search({
    message: fallback ? `${message} (${fallback})` : message,
    source: (term) => matching(term ?? fallback),
  });
};
