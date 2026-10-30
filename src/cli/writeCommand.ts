/**
 * defineWriteCommand: what every command that writes registry files shares: flags or prompts in, every check on a copy, then the write.
 * @dev review: src/cli/checkStaged.ts, then src/cli/addCommand.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CliError, FlagFormatError, MissingFieldError, NoSuchRowError, RowExistsError } from '../errors/cli';
import { ACKS_DIR, loadRegistry } from '../registry';
import type { Registry } from '../schema';
import { dayOf } from '../utils/days';
import { jsonText } from '../utils/writeFile';
import { askInTerminal, type Ask, type Choice } from './ask';
import { changeLine, changes } from './changes';
import { checkStaged, type StagedFile } from './checkStaged';
import { commaList } from './commaList';
import type { CliCommand } from './index';
import { REGISTRY_FLAG, registryOf } from './registryFlag';
import { writeAtomic } from './writeAtomic';

export type FlagValue = string | string[] | boolean;
export type FlagValues = Record<string, FlagValue | undefined>;

export interface Field {
  flag: string;
  description: string;
  required?: boolean | ((values: FlagValues) => boolean);
  list?: boolean;
  choices?: (registry: Registry) => Choice[];
  fallback?: () => FlagValue;
}

// replaces: the file may exist and is meant to change; remove: the file is deleted;
// allows: the error kinds the file may bring, by error name, such as an undated deployment under --no-discover.
export interface FileToWrite {
  path: string;
  content?: unknown;
  replaces?: boolean;
  remove?: boolean;
  conflict?: string;
  allows?: string[];
}

export interface WriteContext {
  args: string[];
  root: string;
  read: (path: string) => unknown;
  // A line for the person running it, printed before the files, or kept in the JSON under --json.
  note: (line: string) => void;
}

export interface WriteSpec {
  name: string;
  description: string;
  arguments?: string;
  fields: Field[];
  files: (values: FlagValues, registry: Registry, context: WriteContext) => FileToWrite[] | Promise<FileToWrite[]>;
}

const COMMON_FLAGS = [
  REGISTRY_FLAG,
  { spec: '--json', description: 'never ask, and print the files as JSON' },
  { spec: '--no-input', description: 'never ask; a missing required flag is an error' },
  { spec: '--dry-run', description: 'check and print the files without writing them' },
];

// commander keeps --no-discover as discover: false.
export const optionKey = (flag: string) =>
  flag
    .split(' ')[0]
    .replace(/^--(no-)?/, '')
    .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

const isEmpty = (value: FlagValue | undefined) =>
  value === undefined || value === '' || (Array.isArray(value) && !value.length);

export const today = (): string => dayOf(new Date());

// A missing required flag is asked in a terminal, and named when no prompt is allowed.
const resolve = async (fields: Field[], options: FlagValues, registry: Registry, ask: Ask | null) => {
  const values: FlagValues = {};
  const missing: string[] = [];
  for (const field of fields) {
    const key = optionKey(field.flag);
    const required = typeof field.required === 'function' ? field.required(values) : field.required === true;
    let value = options[key] ?? field.fallback?.();
    if (isEmpty(value) && required && ask) {
      value = await ask({ key, message: field.description, choices: field.choices?.(registry), list: field.list });
    }
    if (field.list && value !== undefined) value = commaList(value);
    if (isEmpty(value) && required) missing.push(field.flag.split(' ')[0]);
    values[key] = isEmpty(value) ? undefined : value;
  }
  return { values, missing };
};

const readerOf = (root: string) => (path: string) => {
  const at = join(root, path);
  if (!existsSync(at)) throw new NoSuchRowError({ file: at, message: 'no such registry file' });
  return JSON.parse(readFileSync(at, 'utf8')) as unknown;
};

type Staged = FileToWrite & StagedFile & { before: unknown };

// A file outside the registry, a removed file that is not there, or a new file that is.
const conflictsOf = (root: string, files: FileToWrite[]) =>
  files.flatMap((file) => {
    const at = join(root, file.path);
    const inside = (dir: string) => !relative(dir, at).startsWith('..');
    if (!inside(root) && !inside(join(root, ACKS_DIR))) {
      return [new FlagFormatError({ file: at, message: 'is outside the registry; a slug flag holds no / or ..' })];
    }
    const exists = existsSync(at);
    if (file.remove && !exists) return [new NoSuchRowError({ file: at, message: 'no such registry file' })];
    const message =
      file.conflict ?? (!file.replaces && !file.remove && exists ? 'already exists; edit the file instead' : null);
    return message ? [new RowExistsError({ file: at, message })] : [];
  });

// The planned files as they would be written: the text, and the file they replace or remove.
const stagedOf = (files: FileToWrite[], exists: (path: string) => boolean, read: (path: string) => unknown): Staged[] =>
  files.map((file) => {
    const before = (file.replaces || file.remove) && exists(file.path) ? read(file.path) : undefined;
    return { ...file, text: file.remove ? '' : jsonText(file.content), before };
  });

export const defineWriteCommand = (spec: WriteSpec): CliCommand => ({
  name: spec.name,
  description: spec.description,
  arguments: spec.arguments,
  flags: [...spec.fields.map((field) => ({ spec: field.flag, description: field.description })), ...COMMON_FLAGS],
  run: async (options, { print, ask }) => {
    const refuse = (errors: { file: string; message: string }[]) => {
      errors.forEach((error) => print(`${error.file}: ${error.message}`));
      return 1;
    };
    const root = registryOf(options.registry);
    if (!existsSync(root)) return refuse([{ file: root, message: 'no such registry folder' }]);
    const quiet = options.json === true || options.input === false;
    const asker = quiet ? null : (ask ?? (process.stdin.isTTY ? askInTerminal : null));
    const before = loadRegistry(root);
    const { values, missing } = await resolve(spec.fields, options as FlagValues, before.registry, asker);
    if (missing.length) {
      return refuse(missing.map((flag) => new MissingFieldError({ file: spec.name, message: `${flag} is required` })));
    }
    const read = readerOf(root);
    const notes: string[] = [];
    const note = (line: string) => (options.json === true ? notes.push(line) : print(line));
    let files: Staged[];
    try {
      const wanted = await spec.files(values, before.registry, { args: options.args, root, read, note });
      files = stagedOf(wanted, (path) => existsSync(join(root, path)), read);
    } catch (error) {
      if (error instanceof CliError) return refuse([error]);
      throw error;
    }
    const conflicts = conflictsOf(root, files);
    if (conflicts.length) return refuse(conflicts);
    const problems = checkStaged(root, before, files, { ignore: files.flatMap((file) => file.allows ?? []) });
    if (problems.length) return refuse(problems.map((problem) => ({ ...problem, file: join(root, problem.file) })));

    const dryRun = options.dryRun === true;
    if (!dryRun) writeAtomic(root, files);
    if (options.json === true) {
      const written = files.map((file) => ({
        path: join(root, file.path),
        content: file.remove ? null : file.content,
        ...(file.remove ? { removed: true } : {}),
      }));
      print(JSON.stringify({ dryRun, files: written, ...(notes.length ? { notes } : {}) }, null, 2));
      return 0;
    }
    for (const file of files) {
      const verb = file.remove ? (dryRun ? 'would remove' : 'removed') : dryRun ? 'would write' : 'wrote';
      print(`${verb} ${join(root, file.path)}`);
      if (!dryRun || file.remove) continue;
      if (!file.replaces) print(file.text.trimEnd());
      else
        changes(file.before ?? {}, file.content)
          .map(changeLine)
          .forEach(print);
    }
    return 0;
  },
});
