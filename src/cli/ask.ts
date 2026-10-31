/**
 * Ask: the seam every question of a command crosses; askInTerminal asks it with @inquirer/prompts, the question's check run on Enter, a pick filtered as the person types, pick many asked again after each pick.
 * @dev review: src/cli/questionnaire.ts
 */
import { input, search } from '@inquirer/prompts';
import type { Answer } from './answers/answerType';
import { yesNoOf } from './answers/picks';

// A choice shows its name and answers its value, as an organization shows its name and answers its slug.
export type Choice = string | { value: string; name: string };

export interface Question {
  key: string;
  // The question itself, marked * when it needs an answer.
  message: string;
  // What the question asks for, an example and what Enter takes, printed above it.
  lines?: string[];
  choices?: Choice[];
  // A pick of several, or several typed answers.
  many?: boolean;
  // The choices suggest, and any typed text is an answer, as a headquarters the registry has not seen yet.
  open?: boolean;
  optional?: boolean;
  // Answered yes or no, Enter taking the default.
  confirm?: boolean;
  default?: Answer;
  // Run on Enter: true, or why the answer is refused.
  check?: (answer: Answer) => true | string;
  // Why the last answer was refused, when it is asked again.
  refused?: string;
}

export type Ask = (question: Question) => Promise<Answer>;

type Option = { value: string; name: string };

const EMPTY: Option = { value: '', name: '(leave empty)' };

// A value no registry row or slug can take, so the end of a pick many is never a choice.
export const DONE = '\u0000done';

const optionOf = (choice: Choice): Option => (typeof choice === 'string' ? { value: choice, name: choice } : choice);

// The choices of the next round of a pick many: (done) first once the answer may end, each option marked when picked.
export const pickRound = (options: Option[], picked: string[], optional: boolean): Option[] => [
  ...(picked.length || optional ? [{ value: DONE, name: '(done)' }] : []),
  ...options.map((option) => (picked.includes(option.value) ? { ...option, name: `${option.name} (picked)` } : option)),
];

// A typed filter hides (done), so Enter after typing picks the first match rather than ending the list.
// A typed filter hides (done), so Enter after typing picks the first match rather than ending the list.
export const matching = (options: Option[], term = '') => {
  const typed = term.toLowerCase().trim();
  return options.filter(({ value, name }) =>
    value === DONE ? !typed : `${name} ${value}`.toLowerCase().includes(typed),
  );
};

// On an open list, a typed text comes after the values it matches, so Enter takes Zug, Switzerland for zug.
const searched = (options: Option[], term: string | undefined, open: boolean | undefined) => {
  const found = matching(options, term);
  const typed = term?.trim();
  return open && typed && !found.some(({ value }) => value === typed)
    ? [...found, { value: typed, name: typed }]
    : found;
};

const PAGE = 10;

const dim = (line: string) => (process.stdout.isTTY ? `\x1b[2m${line}\x1b[22m` : line);

const pickOne = (question: Question, options: Option[], validate: (value: string) => true | string) => {
  const fallback = typeof question.default === 'string' ? question.default : undefined;
  // The offered value heads the list, so Enter takes it, and (leave empty) follows it on an optional question.
  const offered = options.filter((option) => option.value === fallback);
  const rest = options.filter((option) => option.value !== fallback);
  const listed = [...offered, ...(question.optional ? [EMPTY] : []), ...rest];
  return search<string>({
    message: question.message,
    pageSize: PAGE,
    validate,
    source: (term) => searched(listed, term, question.open),
  });
};

const pickMany = async (question: Question, options: Option[]) => {
  let picked = [question.default ?? []].flat().map(String);
  const names = new Map(options.map((option) => [option.value, option.name]));
  for (;;) {
    const listed = pickRound(options, picked, question.optional === true);
    const picks = picked.length ? ` (picked: ${picked.map((value) => names.get(value) ?? value).join(', ')})` : '';
    const value = await search<string>({
      message: `${question.message}${picks}`,
      pageSize: PAGE,
      validate: (chosen) => (chosen === DONE ? (question.check?.(picked) ?? true) : true),
      source: (term) => searched(listed, term, question.open),
    });
    if (value === DONE) return picked;
    picked = picked.includes(value) ? picked.filter((item) => item !== value) : [...picked, value];
  }
};

export const askInTerminal: Ask = async (question) => {
  for (const line of question.lines ?? []) console.log(dim(`  ${line}`));
  if (question.refused) console.log(`  ${question.refused}`);
  const check = (answer: Answer) => question.check?.(answer) ?? true;
  if (question.confirm) {
    const fallback = typeof question.default === 'boolean' ? question.default : undefined;
    const typed = await input({
      message: question.message,
      validate: (text) => (text.trim() === '' && fallback !== undefined ? true : check(text.trim())),
    });
    if (!typed.trim()) return fallback ?? '';
    return yesNoOf(typed) === true;
  }
  const options = (question.choices ?? []).map(optionOf);
  if (!options.length) {
    const fallback = Array.isArray(question.default) ? question.default.join(', ') : question.default;
    return input({
      message: question.message,
      default: typeof fallback === 'string' ? fallback : undefined,
      validate: check,
    });
  }
  return question.many ? pickMany(question, options) : pickOne(question, options, check);
};
