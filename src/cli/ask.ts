/**
 * Ask: how an add command gets a required flag it was not given; askInTerminal asks with @inquirer/prompts.
 * @dev review: src/cli/addCommand.ts
 */
import { checkbox, input, search, select } from '@inquirer/prompts';

// A choice shows its name and answers its value, as an organization shows its name and answers its slug.
export type Choice = string | { value: string; name: string };

export interface Question {
  key: string;
  message: string;
  choices?: Choice[];
  list?: boolean;
}

export type Ask = (question: Question) => Promise<string | string[]>;

export const askInTerminal: Ask = async ({ message, choices, list }) => {
  if (!choices?.length) return input({ message });
  const options = choices.map((choice) => (typeof choice === 'string' ? { value: choice, name: choice } : choice));
  if (list) return checkbox({ message, choices: options });
  if (options.length <= 20) return select({ message, choices: options });
  // A long list, such as the organizations, is filtered by what the person types.
  const matching = (term = '') => options.filter(({ name }) => name.toLowerCase().includes(term.toLowerCase()));
  return search({ message, source: (term) => matching(term) });
};
