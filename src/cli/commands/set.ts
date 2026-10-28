/**
 * set: one field of one registry file, the value parsed by its schema type, or the whole file with --file; every check runs on a copy and the source goes to the patch csv.
 * An organization's kind and an underlying's class are its folder, so setting one moves the file to the new folder.
 * @dev review: src/cli/fieldValue.ts, src/cli/writeCommand.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { FlagFormatError, NoSuchRowError } from '../../errors/cli';
import { homeFile } from '../../registry';
import { homeOf } from '../../registry/layout';
import { tables, toFile, toRow, type TableName } from '../../schema';
import { setAt, stepsOf } from '../../utils/fieldPath';
import { isObject } from '../../utils/isObject';
import { parseFieldValue, parseJson } from '../fieldValue';
import { defineWriteCommand, PATCHES_FIELD, today, type FileToWrite } from '../writeCommand';
import type { PatchSource } from '../patchRows';

// The file as given from the working directory or from the registry folder, always as its path inside the registry.
const insideRoot = (root: string, file: string) => {
  const fromCwd = relative(resolve(root), resolve(file));
  return isAbsolute(file) || !fromCwd.startsWith('..') ? fromCwd : file;
};

// The file in its schema's order, nested rows too, so a field set where the file had none sits where add puts it.
const inSchemaOrder = (table: TableName, json: unknown): unknown => {
  if (!isObject(json)) return json;
  const row = toRow(table, json);
  for (const [key, child] of Object.entries(tables[table].children ?? {}) as [string, TableName][]) {
    const items = row[key];
    if (Array.isArray(items)) row[key] = items.map((item: unknown) => inSchemaOrder(child, item));
  }
  return toFile(table, row);
};

// The field a table's folder names, which set moves the file for rather than writes.
export const FOLDER_FIELDS: Partial<Record<TableName, string>> = { organization: 'kind', underlying: 'class' };

// Every reference names the row by slug, which the move keeps, so no other file changes; the checks then refuse a
// kind the file's blocks, assets or venue do not fit, or a class that is not an underlying class.
const moveFolder = (
  table: 'organization' | 'underlying',
  path: string,
  before: unknown,
  value: string,
  log: PatchSource,
) => {
  if (table === 'organization' && value === 'venue-operator')
    throw new FlagFormatError({ file: 'set', message: 'a venue operator is added with add venue, beside its venue' });
  const field = FOLDER_FIELDS[table]!;
  const current = homeOf(path)!.implied!;
  const next = homeFile(table, { [field]: value, slug: toRow(table, before as Record<string, unknown>).slug });
  if (next === path) return [{ path, content: before, replaces: true, log }];
  return [
    { path: next, content: before, log, logChanges: [[field, current, value]] },
    { path, remove: true },
  ] satisfies FileToWrite[];
};

export const set = defineWriteCommand({
  name: 'set',
  description:
    "set one field of one registry file, or replace the file with --file, with the source it came from; an organization's kind or an underlying's class moves its file",
  arguments: '<file> [field] [value]',
  fields: [
    { flag: '--source <url>', description: 'the page or API answer the value was read from', required: true },
    { flag: '--reason <text>', description: 'why it changed, kept beside the source' },
    { flag: '--file <json>', description: 'a JSON file that replaces the whole registry file' },
    PATCHES_FIELD,
  ],
  files: (values, _registry, { args, root, read }) => {
    const [given, field, text] = args;
    const path = insideRoot(root, given!);
    const home = homeOf(path);
    if (!home) throw new NoSuchRowError({ file: path, message: 'is not a registry file' });
    const before = read(path);
    const source = values.reason ? `${values.source}; ${values.reason}` : String(values.source);
    const log = { source, fetchedAt: today(), agent: 'cli set' };
    const table = home.table;
    if ((table === 'organization' || table === 'underlying') && field === FOLDER_FIELDS[table] && text !== undefined)
      return moveFolder(table, path, before, text, log);
    let content: unknown;
    if (typeof values.file === 'string') {
      if (field !== undefined)
        throw new FlagFormatError({ file: 'set', message: '--file replaces the whole file, so it takes no field' });
      if (!existsSync(values.file)) throw new NoSuchRowError({ file: values.file, message: 'no such file' });
      content = parseJson(readFileSync(values.file, 'utf8'), values.file);
    } else {
      if (field === undefined || text === undefined) {
        throw new FlagFormatError({
          file: 'set',
          message: 'set needs <file> <field> <value>, or <file> --file <json>',
        });
      }
      content = inSchemaOrder(home.table, setAt(before, stepsOf(field), parseFieldValue(home.table, field, text)));
    }
    return [{ path, content, replaces: true, log }];
  },
});
