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
import { askInTerminal } from './ask';
import { changeLine, changes } from './changes';
import { checkStaged, type StagedFile } from './checkStaged';
import type { CliCommand } from './index';
import { REGISTRY_FLAG, registryOf } from './registryFlag';
import {
  askFields,
  isArgument,
  optionKey,
  type Answers,
  type Assigned,
  type Field,
  type FlagValues,
  type WriteContext,
} from './questionnaire';
import { writeAtomic } from './writeAtomic';

export { optionKey } from './questionnaire';
export type { Field, FlagValue, FlagValues, WriteContext } from './questionnaire';

// replaces: the file may exist and is meant to change; remove: the file is deleted.
export interface FileToWrite {
  path: string;
  content?: unknown;
  replaces?: boolean;
  remove?: boolean;
  conflict?: string;
}

export interface WriteSpec {
  name: string;
  description: string;
  // The usage of arguments no <name> field asks, as set's <file> [field] [value].
  arguments?: string;
  // In the order they are asked, the <name> arguments first.
  fields: Field[];
  // Every field is asked in a terminal, then confirmed with what the command assigns; otherwise only a missing required one.
  every?: boolean;
  assigned?: Assigned[];
  // The fields a --from file gives, which skip their questions.
  given?: (options: FlagValues) => Record<string, unknown>;
  files: (values: FlagValues, registry: Registry, context: WriteContext) => FileToWrite[] | Promise<FileToWrite[]>;
}

const COMMON_FLAGS = [
  REGISTRY_FLAG,
  { spec: '--json', description: 'never ask, and print the files as JSON' },
  { spec: '--no-input', description: 'never ask; a missing required flag is an error' },
  { spec: '--dry-run', description: 'check and print the files without writing them' },
];

export const today = (): string => dayOf(new Date());

export const ASKS =
  'In a terminal it asks for every argument and flag it is not given, in the order above, then lists them all for a yes or no; --no-input and --json never ask.';

// --help marks a flag required with no other flag given, which the README's command table reads into its own column.
const helpFlag = (field: Field) => {
  const required = typeof field.required === 'function' ? field.required({}) : field.required === true;
  return { spec: field.flag, description: required ? `required: ${field.description}` : field.description };
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

const argumentsOf = (spec: WriteSpec) => {
  const asked = spec.fields.filter(isArgument).map((field) => `[${optionKey(field.flag)}]`);
  return asked.length ? asked.join(' ') : spec.arguments;
};

export const defineWriteCommand = (spec: WriteSpec): CliCommand => ({
  name: spec.name,
  description: spec.description,
  arguments: argumentsOf(spec),
  ...(spec.every ? { help: ASKS } : {}),
  flags: [...spec.fields.filter((field) => !isArgument(field)).map(helpFlag), ...COMMON_FLAGS],
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
    const read = readerOf(root);
    const notes: string[] = [];
    const note = (line: string) => (options.json === true ? notes.push(line) : print(line));
    const context: WriteContext = { args: options.args, root, read, note, memo: new Map() };
    const positional = spec.fields.filter(isArgument).map((field) => optionKey(field.flag));
    const flags: FlagValues = {
      ...(options as FlagValues),
      ...Object.fromEntries(positional.map((key, i) => [key, options.args[i]])),
    };
    let answers: Answers;
    try {
      const given = spec.given?.(flags) ?? {};
      answers = await askFields(
        { fields: spec.fields, every: spec.every, assigned: spec.assigned },
        { flags, given, context: { ...context, registry: before.registry, flags } },
        asker,
      );
    } catch (error) {
      if (error instanceof CliError) return refuse([error]);
      throw error;
    }
    const { values, missing, cancelled } = answers;
    if (cancelled) return refuse([{ file: spec.name, message: 'cancelled; nothing written' }]);
    if (missing.length) {
      return refuse(missing.map((flag) => new MissingFieldError({ file: spec.name, message: `${flag} is required` })));
    }
    const args = positional.length ? positional.map((key) => String(values[key])) : options.args;
    let files: Staged[];
    try {
      const wanted = await spec.files(values, before.registry, { ...context, args });
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
