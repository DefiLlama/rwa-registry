/**
 * validate: every check over the registry, or the problems of the one file given, one `file: message` line per error and one count line per warning kind.
 * @dev review: src/registry/loadRegistry.ts
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileProblems, loadRegistry, type Problem } from '../../registry';
import { groupBy } from '../../utils/groupBy';
import { toCsv } from '../../utils/toCsv';
import type { CliCommand } from '../index';
import { REGISTRY_FLAG, registryOf } from '../registryFlag';

const kindOf = (problem: Problem) =>
  problem.error
    .replace(/Error$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();

const writeAudit = (out: string, kind: string, rows: Problem[]): string => {
  const file = join(out, 'audit', `${kind}.csv`);
  mkdirSync(join(out, 'audit'), { recursive: true });
  writeFileSync(file, toCsv(['file', 'path', 'message'], rows));
  return file;
};

// The file as the loader names it, from the registry folder, or why it is not one.
const registryPath = (root: string, path: string): { file: string } | { error: string } => {
  if (!existsSync(path)) return { error: 'no such file' };
  const file = relative(resolve(root), resolve(path)).split(sep).join('/');
  return file.startsWith('..') ? { error: `is not in the registry folder ${root}` } : { file };
};

export const validate: CliCommand = {
  name: 'validate',
  description: 'check the registry files, or the one file given: schemas, references, keys and addresses',
  arguments: '[path]',
  flags: [
    REGISTRY_FLAG,
    { spec: '--out <dir>', description: 'write the rows of each warning kind to <dir>/audit/<kind>.csv' },
    { spec: '--json', description: 'print the problems as JSON' },
  ],
  run: async ({ registry, out, json, args }, { print }) => {
    const root = registryOf(registry);
    if (!existsSync(root)) {
      print(`${root}: no such registry folder`);
      return 1;
    }
    const [path] = args;
    const target = path === undefined ? null : registryPath(root, path);
    if (target && 'error' in target) {
      print(`${path}: ${target.error}`);
      return 1;
    }
    const loaded = loadRegistry(root);
    const problems = (target ? fileProblems(loaded, target.file) : loaded.problems).map((problem) => ({
      ...problem,
      file: join(root, problem.file),
    }));
    const errors = problems.filter((problem) => problem.severity === 'error');
    if (json) print(JSON.stringify(problems, null, 2));
    else {
      errors.forEach((problem) => print(`${problem.file}: ${problem.message}`));
      for (const [kind, rows] of groupBy(
        problems.filter((problem) => problem.severity === 'warning'),
        kindOf,
      )) {
        const where = typeof out === 'string' ? writeAudit(out, kind, rows) : 'pass --out <dir> to list them';
        print(`warning: ${kind}: ${rows.length} (${where})`);
      }
      if (target && !errors.length) print(`${path}: no errors`);
    }
    return errors.length ? 1 : 0;
  },
};
