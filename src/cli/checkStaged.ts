/**
 * checkStaged: the errors new, changed or removed files bring, found by loading a copy of the registry with them in place.
 * @dev review: src/registry/loadRegistry.ts
 */
import { constants, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ACKS_DIR, loadRegistry, type Problem } from '../registry';
import { problemId } from '../registry/problem';
import type { Registry } from '../schema';

export interface StagedFile {
  path: string;
  text: string;
  remove?: boolean;
}

export const checkStaged = (
  root: string,
  before: { registry: Registry; problems: Problem[] },
  files: StagedFile[],
): Problem[] => {
  const stage = mkdtempSync(join(tmpdir(), 'rwa-add-'));
  try {
    const copy = join(stage, 'registry');
    cpSync(root, copy, { recursive: true, mode: constants.COPYFILE_FICLONE });
    // The acks sit beside the registry, so the copy gets them beside it too.
    const acks = join(root, ACKS_DIR);
    if (existsSync(acks)) cpSync(acks, join(copy, ACKS_DIR), { recursive: true, mode: constants.COPYFILE_FICLONE });
    for (const file of files) {
      if (file.remove) {
        rmSync(join(copy, file.path));
        continue;
      }
      mkdirSync(dirname(join(copy, file.path)), { recursive: true });
      writeFileSync(join(copy, file.path), file.text);
    }
    // An error the registry already had is not the new files' to fix.
    const known = new Set(before.problems.map(problemId));
    return loadRegistry(copy, before.registry).problems.filter(
      (problem) => problem.severity === 'error' && !known.has(problemId(problem)),
    );
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
};
