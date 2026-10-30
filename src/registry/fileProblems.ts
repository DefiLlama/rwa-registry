/**
 * fileProblems: the problems of one registry file out of a loaded registry: its own, and a key of its rows that another file also holds.
 * @dev review: src/cli/commands/validate.ts
 */
import { TABLE_NAMES, type Registry } from '../schema';
import { keyOf, rowsOf } from './keys';
import { fileOf } from './place';
import type { Problem } from './problem';

// uniqueKeys reports a shared key on the second row it meets, which may sit in the other file.
const sharedWith = (registry: Registry, file: string): string[] =>
  TABLE_NAMES.flatMap((table) =>
    rowsOf(registry, table)
      .filter((row) => fileOf(row) === file)
      .map((row) => ` is also on ${table} ${keyOf(table, row)}`),
  );

export const fileProblems = (loaded: { registry: Registry; problems: Problem[] }, file: string): Problem[] => {
  const shared = sharedWith(loaded.registry, file);
  return loaded.problems.filter(
    (problem) => problem.file === file || shared.some((suffix) => problem.message.endsWith(suffix)),
  );
};
