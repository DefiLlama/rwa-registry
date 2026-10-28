/**
 * defineWriteCommand: what every command that writes registry files shares: flags or prompts in, every check on a copy, then the write.
 * @dev review: src/cli/checkStaged.ts, then src/cli/addCommand.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { CliError, FlagFormatError, MissingFieldError, NoSuchRowError, RowExistsError } from '../errors/cli';
import { ACKS_DIR, loadRegistry } from '../registry';
import type { Registry } from '../schema';
import { dayOf } from '../utils/days';
import { isObject } from '../utils/isObject';
import { jsonText } from '../utils/writeFile';
import { askInTerminal, type Ask, type Choice } from './ask';
import { checkStaged, type StagedFile } from './checkStaged';
import { commaList } from './commaList';
import type { CliCommand } from './index';
import { appendPatchRows, changeRows, patchRows, type Change, type PatchRow, type PatchSource } from './patchRows';
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

// replaces: the file may exist and is meant to change; remove: the file is deleted; log: its changes become patch rows;
// logChanges: the rows to log in place of a diff, for a value the file's folder holds, such as an organization's kind.
export interface FileToWrite {
  path: string;
  content?: unknown;
  replaces?: boolean;
  remove?: boolean;
  conflict?: string;
  log?: PatchSource;
  logChanges?: Change[];
}

export interface WriteContext {
  args: string[];
  root: string;
  read: (path: string) => unknown;
  // A line for the person running it, printed before the files, or kept in the JSON under --json.
  note: (line: string) => void;
  // A row handed over in code, by migrate or apply, in place of the flags; only a command with fromInput takes one.
  input?: unknown;
}

export interface WriteSpec {
  name: string;
  description: string;
  arguments?: string;
  fields: Field[];
  files: (values: FlagValues, registry: Registry, context: WriteContext) => FileToWrite[] | Promise<FileToWrite[]>;
  fromInput?: (input: unknown, registry: Registry, context: WriteContext) => FileToWrite[] | Promise<FileToWrite[]>;
}

// A command that writes registry files, and plan, the files it would write for its flags or an input with every refusal
// of its own thrown as a CliError, so a caller in code runs the registry checks and the write itself.
export interface WriteCommand extends CliCommand {
  plan: (
    options: FlagValues & { args?: string[] },
    registry: Registry,
    context: Omit<WriteContext, 'args'>,
  ) => Promise<FileToWrite[]>;
}

export const PATCHES_FIELD: Field = {
  flag: '--patches <dir>',
  description: 'the folder of patch csv files the source rows go to, patches/ beside the registry by default',
};

const NO_SOURCE: PatchSource = { source: '', fetchedAt: '', agent: '' };

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

export const readerOf = (root: string) => (path: string) => {
  const at = join(root, path);
  if (!existsSync(at)) throw new NoSuchRowError({ file: at, message: 'no such registry file' });
  return JSON.parse(readFileSync(at, 'utf8')) as unknown;
};

export type Staged = FileToWrite & StagedFile & { before: unknown };

// A file outside the registry, a removed file that is not there, or a new file that is: exists answers from disk, or
// from the files a caller holds in memory.
export const conflictsOf = (
  root: string,
  files: FileToWrite[],
  existsIn = (path: string) => existsSync(join(root, path)),
) =>
  files.flatMap((file) => {
    const at = join(root, file.path);
    const inside = (dir: string) => !relative(dir, at).startsWith('..');
    if (!inside(root) && !inside(join(root, ACKS_DIR))) {
      return [new FlagFormatError({ file: at, message: 'is outside the registry; a slug flag holds no / or ..' })];
    }
    const exists = existsIn(file.path);
    if (file.remove && !exists) return [new NoSuchRowError({ file: at, message: 'no such registry file' })];
    const message =
      file.conflict ?? (!file.replaces && !file.remove && exists ? 'already exists; edit the file instead' : null);
    return message ? [new RowExistsError({ file: at, message })] : [];
  });

// An identifier a command writes says whether someone read it: verified when it names a source URL, unverified otherwise.
const withVerified = (content: unknown): unknown => {
  if (!isObject(content) || !Array.isArray(content.identifiers)) return content;
  const identifiers = content.identifiers.map((item: unknown) =>
    isObject(item) && item.verified === undefined
      ? { ...item, verified: typeof item.source === 'string' && /^https?:\/\//.test(item.source) }
      : item,
  );
  return { ...content, identifiers };
};

// The planned files as they would be written: identifiers marked, the text, and the file they replace or remove.
export const stagedOf = (
  files: FileToWrite[],
  exists: (path: string) => boolean,
  read: (path: string) => unknown,
): Staged[] =>
  files.map((file) => {
    const content = file.remove ? file.content : withVerified(file.content);
    const before = (file.replaces || file.remove) && exists(file.path) ? read(file.path) : undefined;
    return { ...file, content, text: file.remove ? '' : jsonText(content), before };
  });

// The patch rows of one written file, by the source given.
export const loggedRows = (file: FileToWrite & { before: unknown }, by: PatchSource): PatchRow[] =>
  file.logChanges ? changeRows(file.path, file.logChanges, by) : patchRows(file.path, file.before, file.content, by);

const rowsOf = (files: Staged[]): PatchRow[] => files.flatMap((file) => (file.log ? loggedRows(file, file.log) : []));

// The flags resolved without a prompt, then the command's files for them, or for the input when one is given.
const planOf =
  (spec: WriteSpec): WriteCommand['plan'] =>
  async (options, registry, context) => {
    const full = { ...context, args: options.args ?? [] };
    if (context.input !== undefined) {
      if (!spec.fromInput) throw new FlagFormatError({ file: spec.name, message: 'takes no input row' });
      return spec.fromInput(context.input, registry, full);
    }
    const { values, missing } = await resolve(spec.fields, options, registry, null);
    if (missing.length) throw new MissingFieldError({ file: spec.name, message: `${missing.join(', ')} required` });
    return spec.files(values, registry, full);
  };

export const defineWriteCommand = (spec: WriteSpec): WriteCommand => ({
  plan: planOf(spec),
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
    const problems = checkStaged(root, before, files);
    if (problems.length) return refuse(problems.map((problem) => ({ ...problem, file: join(root, problem.file) })));

    const dryRun = options.dryRun === true;
    const patches = rowsOf(files);
    const patchDir = typeof options.patches === 'string' ? options.patches : join(dirname(root), 'patches');
    if (!dryRun) writeAtomic(root, files);
    const patchFile = !dryRun && patches.length ? appendPatchRows(patchDir, patches) : null;
    if (options.json === true) {
      const written = files.map((file) => ({
        path: join(root, file.path),
        content: file.remove ? null : file.content,
        ...(file.remove ? { removed: true } : {}),
      }));
      const logged = patches.length ? { patches, patchFile } : {};
      print(JSON.stringify({ dryRun, files: written, ...logged, ...(notes.length ? { notes } : {}) }, null, 2));
      return 0;
    }
    for (const file of files) {
      const verb = file.remove ? (dryRun ? 'would remove' : 'removed') : dryRun ? 'would write' : 'wrote';
      print(`${verb} ${join(root, file.path)}`);
      if (!dryRun || file.remove) continue;
      if (!file.replaces) print(file.text.trimEnd());
      else
        for (const row of patchRows(file.path, file.before, file.content, NO_SOURCE))
          print(`  ${row.path}: ${row.old || '(none)'} -> ${row.new || '(none)'}`);
    }
    if (patchFile) print(`appended ${patches.length} source rows to ${patchFile}`);
    else if (patches.length)
      print(`would append ${patches.length} source rows to ${join(patchDir, `${patches[0]!.fetchedAt}.csv`)}`);
    return 0;
  },
});
