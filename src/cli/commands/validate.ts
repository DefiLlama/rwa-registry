/**
 * validate: every check over the registry, one `file: message` line per error and one count line per warning kind.
 * @dev review: src/registry/loadRegistry.ts
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRegistry, type Problem } from '../../registry';
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

export const validate: CliCommand = {
  name: 'validate',
  description: 'check the registry files: schemas, references, keys and addresses',
  flags: [
    REGISTRY_FLAG,
    { spec: '--out <dir>', description: 'write the rows of each warning kind to <dir>/audit/<kind>.csv' },
    { spec: '--json', description: 'print the problems as JSON' },
  ],
  run: async ({ registry, out, json }, { print }) => {
    const root = registryOf(registry);
    if (!existsSync(root)) {
      print(`${root}: no such registry folder`);
      return 1;
    }
    const problems = loadRegistry(root).problems.map((problem) => ({
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
    }
    return errors.length ? 1 : 0;
  },
};
