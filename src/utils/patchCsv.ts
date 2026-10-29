/**
 * patchCsv: the patch csv the registry keeps as its change log, one row per changed value of one file with the source it was read from and the day it was read.
 * @dev review: src/cli/patchRows.ts, src/discover/discoverDates.ts
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { toCsv } from './toCsv';

export const PATCH_COLUMNS = ['file', 'path', 'old', 'new', 'source', 'fetchedAt', 'agent', 'verified'] as const;
export type PatchRow = Record<(typeof PATCH_COLUMNS)[number], string>;

// The cell of a value the source could not give; a command reads it as null.
export const UNKNOWN = 'unknown';

// One csv file, or every csv of a folder in name order.
export const readPatches = (path: string): PatchRow[] => {
  const files = statSync(path).isDirectory()
    ? readdirSync(path)
        .filter((name) => name.endsWith('.csv'))
        .sort()
        .map((name) => join(path, name))
    : [path];
  return files.flatMap(
    (file) => parse(readFileSync(file, 'utf8'), { columns: true, bom: true, skip_empty_lines: true }) as PatchRow[],
  );
};

// The header is written once, by the first rows a file gets.
export const appendPatchFile = (file: string, rows: PatchRow[]): void => {
  const text = toCsv(PATCH_COLUMNS, rows);
  appendFileSync(file, existsSync(file) ? text.slice(text.indexOf('\n') + 1) : text);
};

export const cellOf = (value: unknown): string =>
  value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
