/**
 * writeAtomic: every file written to a dotfile beside it, then all renamed and the removed ones deleted, so a failed write leaves no half row.
 * @dev review: src/cli/writeCommand.ts
 */
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { StagedFile } from './checkStaged';

export const writeAtomic = (root: string, files: StagedFile[]): void => {
  const moves = files
    .filter((file) => !file.remove)
    .map((file) => {
      const target = join(root, file.path);
      const temporary = join(dirname(target), `.${basename(target)}.${process.pid}.tmp`);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(temporary, file.text);
      return [temporary, target] as const;
    });
  for (const [temporary, target] of moves) renameSync(temporary, target);
  for (const file of files.filter((file) => file.remove)) rmSync(join(root, file.path));
};
