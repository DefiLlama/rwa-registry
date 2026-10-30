/**
 * set: one field of one registry file parsed by its schema type, or the whole file with --file; an organization's kind moves its file.
 * @dev review: src/cli/fieldValue.ts, src/cli/writeCommand.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { FlagFormatError, NoSuchRowError } from '../../errors/cli';
import { homeFile } from '../../registry';
import { homeOf } from '../../registry/layout';
import { inSchemaOrder, toRow } from '../../schema';
import { setAt, stepsOf } from '../../utils/fieldPath';
import { parseFieldValue, parseJson } from '../fieldValue';
import { defineWriteCommand, type FileToWrite } from '../writeCommand';

// The file as given from the working directory or from the registry folder, always as its path inside the registry.
const insideRoot = (root: string, file: string) => {
  const fromCwd = relative(resolve(root), resolve(file));
  return isAbsolute(file) || !fromCwd.startsWith('..') ? fromCwd : file;
};

// An organization's kind is its folder. Every reference names the row by slug, which the move keeps, so no other
// file changes; the checks then refuse a kind the file's blocks, assets or venue do not fit.
const moveKind = (path: string, before: unknown, value: string, note: (line: string) => void): FileToWrite[] => {
  if (value === 'venue-operator')
    throw new FlagFormatError({ file: 'set', message: 'a venue operator is added with add venue, beside its venue' });
  const current = homeOf(path)!.implied!;
  const next = homeFile('organization', {
    kind: value,
    slug: toRow('organization', before as Record<string, unknown>).slug,
  });
  if (next === path) return [{ path, content: before, replaces: true }];
  note(`${path}: kind ${current} -> ${value}, so the file moves to ${next}`);
  return [
    { path: next, content: before },
    { path, remove: true },
  ];
};

export const set = defineWriteCommand({
  name: 'set',
  description:
    "set one field of one registry file, or replace the file with --file; an organization's kind moves its file",
  arguments: '<file> [field] [value]',
  fields: [{ flag: '--file <json>', description: 'a JSON file that replaces the whole registry file' }],
  files: (values, _registry, { args, root, read, note }) => {
    const [given, field, text] = args;
    const path = insideRoot(root, given!);
    const home = homeOf(path);
    if (!home) throw new NoSuchRowError({ file: path, message: 'is not a registry file' });
    const before = read(path);
    const table = home.table;
    if (table === 'organization' && field === 'kind' && text !== undefined) return moveKind(path, before, text, note);
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
    return [{ path, content, replaces: true }];
  },
});
