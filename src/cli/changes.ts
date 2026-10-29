/**
 * changes: the values one written file changed, each as its path in the file with the old and the new value; a dry run prints one line per change.
 * @dev review: src/cli/writeCommand.ts
 */
import { isObject } from '../utils/isObject';

export type Change = [path: string, old: unknown, next: unknown];

const step = (path: string, key: string | number) =>
  typeof key === 'number' ? `${path}[${key}]` : path ? `${path}.${key}` : key;

const shown = (value: unknown): string =>
  value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);

export const changes = (before: unknown, after: unknown, path = ''): Change[] => {
  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return keys.flatMap((key) => changes(before[key], after[key], step(path, key)));
  }
  if (Array.isArray(before) && Array.isArray(after) && before.length && after.length) {
    const length = Math.max(before.length, after.length);
    return Array.from({ length }, (_, i) => changes(before[i], after[i], step(path, i))).flat();
  }
  return shown(before) === shown(after) && (before === null) === (after === null) ? [] : [[path, before, after]];
};

export const changeLine = ([path, old, next]: Change): string =>
  `  ${path}: ${shown(old) || '(none)'} -> ${shown(next) || '(none)'}`;
