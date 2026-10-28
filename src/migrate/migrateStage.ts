/**
 * migrateStage: one stage of the two exports landed through the add commands: the import's mapping builds every file,
 * the stage's files become calls, a session lands them with every check on, and the held rows and counts are written.
 * @dev review: src/migrate/stages.ts, src/cli/session.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Session } from '../cli/session';
import { today } from '../cli/writeCommand';
import { checkPatches, PATCH_COLUMNS, readPatches, type PatchRow } from '../import/applyPatch';
import { mapExports, readExports } from '../import/importExports';
import { isOracleRow } from '../import/oracleMap';
import { toCsv } from '../utils/toCsv';
import { countsOf, writeLandReport } from './landReport';
import { callsOf, stageOf, type Stage } from './stages';

export interface MigrateOptions {
  markets: string;
  platforms: string;
  stage: Stage;
  root: string;
  out: string;
  dryRun: boolean;
  // Export cell rows and the oracle map applied over the exports before the mapping, as the import applied them.
  exportPatches?: string | null;
  // The batches folder, whose oracle map and oracle firms every stage reads, so the oracle roles and their Oracle Proof
  // Links land with the organizations and assets; its other rows land through apply.
  batches?: string | null;
  // A registry whose vocabularies and category rules were decided: the vocabularies stage lands them, the sheet's values
  // folded in, since they are decided data and not sheet data.
  fromRegistry?: string | null;
  // Where the patch rows of a command that logs its source go, patches/ beside the registry.
  patchDir: string;
}

export interface MigrateResult {
  report: string;
  added: number;
  present: number;
  held: number;
}

const EXPORT_ROW = /^export:/;

export const migrateStage = async (options: MigrateOptions): Promise<MigrateResult> => {
  const started = Date.now();
  const read = readExports(options.markets, options.platforms);
  const oracle = options.batches ? readPatches(options.batches).filter(isOracleRow) : [];
  const all = [...(options.exportPatches ? readPatches(options.exportPatches) : []), ...oracle];
  const checked = checkPatches(all.filter((row) => EXPORT_ROW.test(row.file)));
  const decided = options.stage === 'vocabularies' && options.fromRegistry ? options.fromRegistry : null;
  // The mapping reads the vocabularies and rules under its root, so the decided ones are read in place of the empty registry's.
  const mapped = mapExports({ read, root: decided ?? options.root, patches: checked.rows, dates: null, folds: [] });
  const calls = callsOf(options.stage, mapped.sorted);
  const unstaged = [...mapped.sorted.keys()].filter((path) => stageOf(path) === null);

  // A sheet row is the registry's own data moving, not a row new against main, so the checks run as validate runs them
  // without --base: an undated deployment, an unread identifier or an undated event warns, as the import left them.
  const session = new Session(options.root, { base: 'none', dryRun: options.dryRun, patches: options.patchDir });
  for (const call of calls) await session.land(call);
  const outcomes = await session.finish();
  const counts = countsOf(outcomes);

  const report = writeLandReport(options.out, 'migrate', options.stage, {
    read: [
      `Export rows read: ${read.markets.length} markets rows and ${read.platforms.length} Platforms rows.`,
      ...(options.exportPatches || options.batches
        ? [`Export patch rows applied over them: ${checked.rows.length}, refused: ${checked.problems.length}.`]
        : []),
      ...(options.batches ? [`Oracle map and oracle firm rows read from ${options.batches}: ${oracle.length}.`] : []),
      ...(decided ? [`Vocabularies and category rules read from ${decided}, the sheet's values folded in.`] : []),
      `Stage rows: ${calls.length}, from the ${mapped.sorted.size} files the mapping writes.`,
    ],
    ...counts,
    extra:
      options.stage === 'markets' && unstaged.length
        ? [`Mapped files no stage lands: ${unstaged.length}, first ${unstaged.slice(0, 5).join(', ')}.`]
        : [],
    seconds: (Date.now() - started) / 1000,
    dryRun: options.dryRun,
  });
  return { report, added: counts.added, present: counts.present, held: counts.held.length };
};
