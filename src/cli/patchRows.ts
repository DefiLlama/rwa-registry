/**
 * patchRows: one row per value a command changed in a registry file, in the columns of the patch csv, the registry's own change log under patches/<day>.csv.
 * @dev review: src/utils/patchCsv.ts
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { appendPatchFile, cellOf, UNKNOWN, type PatchRow } from '../utils/patchCsv';
import { isObject } from '../utils/isObject';

export type { PatchRow } from '../utils/patchCsv';

export interface PatchSource {
  source: string;
  fetchedAt: string;
  agent: string;
}

const step = (path: string, key: string | number) =>
  typeof key === 'number' ? `${path}[${key}]` : path ? `${path}.${key}` : key;

export type Change = [path: string, old: unknown, next: unknown];

const changes = (before: unknown, after: unknown, path: string): Change[] => {
  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return keys.flatMap((key) => changes(before[key], after[key], step(path, key)));
  }
  if (Array.isArray(before) && Array.isArray(after) && before.length && after.length) {
    const length = Math.max(before.length, after.length);
    return Array.from({ length }, (_, i) => changes(before[i], after[i], step(path, i))).flat();
  }
  return cellOf(before) === cellOf(after) && (before === null) === (after === null) ? [] : [[path, before, after]];
};

export const changeRows = (file: string, list: Change[], by: PatchSource): PatchRow[] =>
  list.map(([path, old, next]) => ({
    file,
    path,
    old: cellOf(old),
    new: next === null ? UNKNOWN : cellOf(next),
    source: by.source,
    fetchedAt: by.fetchedAt,
    agent: by.agent,
    verified: '',
  }));

export const patchRows = (file: string, before: unknown, after: unknown, by: PatchSource): PatchRow[] =>
  changeRows(file, changes(before ?? {}, after, ''), by);

export const appendPatchRows = (dir: string, rows: PatchRow[]): string => {
  const file = join(dir, `${rows[0]!.fetchedAt}.csv`);
  mkdirSync(dir, { recursive: true });
  appendPatchFile(file, rows);
  return file;
};
