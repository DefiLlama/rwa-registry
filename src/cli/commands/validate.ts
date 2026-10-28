/**
 * validate: every check over the registry, one `file: message` line per error and one count line per warning kind.
 * @dev review: src/registry/loadRegistry.ts
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadChecked } from '../../build/loadChecked';
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
  description: 'check the registry files: schemas, references, keys, addresses and the rules against main',
  flags: [
    REGISTRY_FLAG,
    { spec: '--base <dir>', description: 'the registry of origin/main, read by the frozen key and new row checks' },
    { spec: '--out <dir>', description: 'write the rows of each warning kind to <dir>/audit/<kind>.csv' },
    { spec: '--json', description: 'print the problems as JSON' },
  ],
  run: async ({ registry, base, out, json }, { print }) => {
    const root = registryOf(registry);
    const missing = [root, ...(typeof base === 'string' ? [base] : [])].filter((folder) => !existsSync(folder));
    if (missing.length) {
      missing.forEach((folder) => print(`${folder}: no such registry folder`));
      return 1;
    }
    const baseRegistry = typeof base === 'string' ? loadRegistry(base).registry : null;
    const problems = loadChecked(root, baseRegistry).problems.map((problem) => ({
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
        const where = typeof out === 'string' ? writeAudit(out, kind, rows) : 'pass --out to list them';
        print(`warning: ${kind}: ${rows.length} (${where})`);
      }
    }
    return errors.length ? 1 : 0;
  },
};
