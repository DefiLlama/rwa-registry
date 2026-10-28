/**
 * readExport: one Airtable export as rows keyed by column, every cell trimmed, with the sheet's placeholders, lists, checkboxes and numbers.
 * @dev review: src/import/importExports.ts
 */
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { ExportReadError } from '../errors';

export type ExportRow = Record<string, string>;

// The sheet's typed stand-ins for nothing.
const PLACEHOLDERS = new Set([
  'x',
  'X',
  '-',
  'N/A',
  'n/a',
  'NA',
  'na',
  'none',
  'None',
  'null',
  'TBD',
  'tbd',
  '?',
  'nan',
]);

const NUMBER = /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const parseExport = (file: string): { header: string[]; rows: ExportRow[] } => {
  let header: string[] = [];
  try {
    const rows: ExportRow[] = parse(readFileSync(file, 'utf8'), {
      columns: (names: string[]) => (header = names),
      bom: true,
      skip_empty_lines: true,
    });
    return { header, rows };
  } catch (cause) {
    throw new ExportReadError({
      file,
      message: `${file} is not a readable export: ${(cause as Error).message}`,
      cause,
    });
  }
};

// A column the import reads and the header lacks fails the read by name, since a renamed column would read as empty on every row.
export const readExport = (file: string, columns: readonly string[]): ExportRow[] => {
  const { header, rows } = parseExport(file);
  const missing = columns.filter((column) => !header.includes(column));
  if (missing.length)
    throw new ExportReadError({
      file,
      message: `${file} lacks the columns the import reads: ${missing.map((column) => `"${column}"`).join(', ')}`,
    });
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, cell]) => [key, cell.trim()])));
};

export const valueOf = (cell: string | undefined): string | null =>
  cell == null || cell === '' || PLACEHOLDERS.has(cell) ? null : cell;

export const listOf = (cell: string | undefined, separator: string | RegExp = ';'): string[] =>
  (valueOf(cell) ?? '')
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item !== '' && !PLACEHOLDERS.has(item));

export const checkbox = (cell: string | undefined): boolean | null => {
  const value = (cell ?? '').toLowerCase();
  if (value === 'checked' || value === 'true') return true;
  return value === 'false' ? false : null;
};

// A sheet flag: TRUE, true or checked is true; FALSE, false, x or unchecked is false; a blank or any other text is null,
// so the file leaves it out and the server publishes null as master did.
const TRUE_SPELLINGS = new Set(['true', 'checked']);
const FALSE_SPELLINGS = new Set(['false', 'x', 'unchecked']);
export const sheetFlag = (cell: string | undefined): boolean | null => {
  const value = (cell ?? '').trim().toLowerCase();
  return TRUE_SPELLINGS.has(value) ? true : FALSE_SPELLINGS.has(value) ? false : null;
};

// The sheet's FALSE where an event carries the TRUE (Suspicious as a review, Delisted as a delisting): false, else null.
export const statedFalse = (cell: string | undefined): false | null => (sheetFlag(cell) === false ? false : null);

export const numberOf = (cell: string | undefined): number | null => {
  const value = valueOf(cell);
  return value != null && NUMBER.test(value) ? Number(value) : null;
};

export const isoDate = (cell: string | undefined): string | null => {
  const value = valueOf(cell);
  return value != null && ISO_DATE.test(value) ? value : null;
};
