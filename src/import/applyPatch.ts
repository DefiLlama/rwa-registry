/**
 * applyPatch: the patch csv rows, each setting one value of one registry file or, as export:<id>, one cell of an export row.
 * @dev review: src/import/importExports.ts
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { PatchError } from '../errors';
import type { Problem } from '../registry';
import { date } from '../schema/primitives';
import { getAt, setAt, stepsOf } from '../utils/fieldPath';
import { toCsv } from '../utils/toCsv';
import type { ExportRow } from './readExport';
import { RWA_ID, type Exports, type FileJson, type RegistryFiles } from './importTypes';

export const PATCH_COLUMNS = ['file', 'path', 'old', 'new', 'source', 'fetchedAt', 'agent', 'verified'] as const;
export type PatchRow = Record<(typeof PATCH_COLUMNS)[number], string>;

export const UNKNOWN = 'unknown';
const EXPORT_FILE = /^export:(.+)$/;

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

const problem = (row: PatchRow, message: string, severity: Problem['severity'] = 'error'): Problem => ({
  file: row.file,
  path: row.path,
  message: `${row.file} ${row.path}: ${message}`,
  error: PatchError.name,
  severity,
});

const valueOfCell = (cell: string): unknown => {
  if (cell === UNKNOWN) return null;
  try {
    return JSON.parse(cell);
  } catch {
    return cell;
  }
};

export const cellOf = (value: unknown): string =>
  value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);

// Every patch row names the source it was read from and the day it was fetched, or it is refused and listed.
export const checkPatches = (rows: PatchRow[]): { rows: PatchRow[]; problems: Problem[] } => {
  const problems: Problem[] = [];
  const kept = rows.filter((row) => {
    if (!row.source?.trim()) problems.push(problem(row, 'a patch value needs a source URL'));
    else if (!date.safeParse(row.fetchedAt).success)
      problems.push(problem(row, `fetchedAt "${row.fetchedAt ?? ''}" is not a YYYY-MM-DD date`));
    else return true;
    return false;
  });
  return { rows: kept, problems };
};

// A patch row is refused without a source and the day it was read, so an identifier it writes was read at that source.
const withVerified = (path: string, value: unknown): unknown =>
  /(^|\.)identifiers$/.test(path) && Array.isArray(value)
    ? value.map((item) =>
        item && typeof item === 'object' && !('verified' in item) ? { ...item, verified: item.source != null } : item,
      )
    : value;

// unknown writes null and is listed; a row whose old value is not the one found is refused.
export const patchFiles = (files: RegistryFiles, rows: PatchRow[]): { files: RegistryFiles; problems: Problem[] } => {
  const out: RegistryFiles = new Map(files);
  const problems: Problem[] = [];
  for (const row of rows.filter((row) => !EXPORT_FILE.test(row.file))) {
    const file = out.get(row.file);
    if (file === undefined) {
      problems.push(problem(row, 'no such registry file'));
      continue;
    }
    const path = stepsOf(row.path);
    const next = withVerified(row.path, valueOfCell(row.new));
    const current = getAt(file, path);
    if (row.new === UNKNOWN) problems.push(problem(row, `unknown after ${row.source}: written as null`, 'warning'));
    if (cellOf(current) === cellOf(next) && current !== undefined) continue;
    if (cellOf(current) !== row.old) {
      problems.push(problem(row, `old value "${row.old}" is not the value found, "${cellOf(current)}"`));
      continue;
    }
    out.set(row.file, setAt(file, path, next) as FileJson);
  }
  return { files: out, problems };
};

export const patchExports = (exports: Exports, rows: PatchRow[]): Exports => {
  const byId = new Map<string, PatchRow[]>();
  for (const row of rows) {
    const id = EXPORT_FILE.exec(row.file)?.[1];
    if (id) byId.set(id, [...(byId.get(id) ?? []), row]);
  }
  const patch = (row: ExportRow, id: string): ExportRow =>
    (byId.get(id) ?? []).reduce((at, cell) => ({ ...at, [cell.path]: cell.new === UNKNOWN ? '' : cell.new }), row);
  return {
    markets: exports.markets.map((row) => patch(row, row[RWA_ID])),
    platforms: exports.platforms.map((row) => patch(row, `PID ${row['*PID']}`)),
  };
};
