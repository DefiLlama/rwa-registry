/**
 * landReport: what one migrate stage or apply batch landed: held-<name>.csv with each refused row and its reason, and
 * <kind>-<name>.md with the counts.
 * @dev review: src/migrate/migrateStage.ts, src/migrate/applyBatch.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Outcome } from '../cli/session';
import { groupBy } from '../utils/groupBy';
import { toCsv } from '../utils/toCsv';

export interface LandCounts {
  read: string[];
  added: number;
  present: number;
  held: Outcome[];
  extra: string[];
  seconds: number;
  dryRun: boolean;
}

export const countsOf = (outcomes: Outcome[]) => ({
  added: outcomes.filter((outcome) => outcome.status === 'added').length,
  present: outcomes.filter((outcome) => outcome.status === 'present').length,
  held: outcomes.filter((outcome) => outcome.status === 'held'),
});

// A reason without the file it names, so one cause held on many rows reads as one line.
const causeOf = (reason: string) => reason.replace(/^[^:]*: /, '').replace(/"[^"]*"/g, '"..."');

export const writeLandReport = (out: string, kind: 'migrate' | 'apply', name: string, counts: LandCounts): string => {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `held-${name}.csv`), toCsv(['id', 'reason'], counts.held));
  const causes = [...groupBy(counts.held, (outcome) => causeOf(outcome.reason))].sort(
    (a, b) => b[1].length - a[1].length,
  );
  const verb = counts.dryRun ? 'would be added' : 'added';
  const lines = [
    `# ${kind} ${name}${counts.dryRun ? ' (dry run)' : ''}`,
    '',
    ...counts.read.map((line) => `- ${line}`),
    `- Rows ${verb}: ${counts.added}.`,
    `- Rows already in the registry, left as they are: ${counts.present}.`,
    `- Rows held: ${counts.held.length}, each with its reason in held-${name}.csv.`,
    ...counts.extra.map((line) => `- ${line}`),
    `- Seconds: ${counts.seconds.toFixed(1)}.`,
    ...(causes.length
      ? ['', '## Held, by cause', '', ...causes.map(([cause, rows]) => `- ${rows.length}: ${cause}`)]
      : []),
    '',
  ];
  const file = join(out, `${kind}-${name}.md`);
  writeFileSync(file, lines.join('\n'));
  return file;
};
