/**
 * build: registry.json from a registry with no error, its derived fields filled at --at.
 * @dev review: src/build/registryJson.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { registryJson } from '../../build/registryJson';
import { loadChecked } from '../../build/loadChecked';
import { deriveFields } from '../../registry';
import { TABLE_NAMES } from '../../schema';
import type { CliCommand } from '../index';
import { REGISTRY_FLAG, registryOf } from '../registryFlag';

export const build: CliCommand = {
  name: 'build',
  description: 'build registry.json from the registry files',
  flags: [
    REGISTRY_FLAG,
    { spec: '--out <dir>', description: 'where registry.json goes, dist by default' },
    { spec: '--commit <sha>', description: 'the commit the registry was built from, written into the file' },
    { spec: '--at <date>', description: 'the build date the status of each row is derived at, today by default' },
  ],
  run: async ({ registry, out, commit, at }, { print }) => {
    if (typeof commit !== 'string') {
      print('build needs --commit, the commit the registry is built from');
      return 1;
    }
    const loaded = loadChecked(registryOf(registry));
    const problems = loaded.problems;
    const errors = problems.filter((problem) => problem.severity === 'error');
    errors.forEach((problem) => print(`${problem.file}: ${problem.message}`));
    if (errors.length) return 1;
    const day = typeof at === 'string' ? at : new Date().toISOString().slice(0, 10);
    const derived = deriveFields(loaded.registry, day);
    const dir = typeof out === 'string' ? out : 'dist';
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'registry.json'), registryJson(derived, commit));
    print(`registry.json: ${TABLE_NAMES.map((table) => `${table} ${derived[table].length}`).join(', ')}`);
    print(`in ${dir}, commit ${commit}, derived at ${day}`);
    return 0;
  },
};
