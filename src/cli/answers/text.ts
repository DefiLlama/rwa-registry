/**
 * text answers: any text, a slug, and a text with the values the registry already holds at its field offered as suggestions.
 * @dev review: src/cli/answers/answerType.ts
 */
import { rowsOf } from '../../registry/keys';
import type { TableName } from '../../schema';
import { slug as slugType } from '../../schema/primitives';
import { getAt } from '../../utils/fieldPath';
import { accepted, refused, type AnswerType } from './answerType';

// Any text: its shape is left unsaid, so a free-text question shows only its example.
export const text: AnswerType = { shape: '', read: (typed) => accepted(typed) };

export const slug: AnswerType = {
  shape: 'a slug: lowercase letters, digits and single hyphens',
  read: (typed) =>
    slugType.safeParse(typed).success
      ? accepted(typed)
      : refused('not a slug; a slug holds lowercase letters, digits and single hyphens, as backed-finance'),
};

// The values the rows of a table hold at a path, the most used first.
const heldValues = (rows: Record<string, unknown>[], path: string[]) => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = getAt(row, path);
    if (typeof value === 'string' && value.trim()) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value]) => value);
};

export const suggested = (table: TableName, path: string[]): AnswerType => ({
  shape: 'any text; the values the registry already holds are listed',
  open: true,
  read: (typed) => accepted(typed),
  choices: ({ registry }) => heldValues(rowsOf(registry, table), path),
});
