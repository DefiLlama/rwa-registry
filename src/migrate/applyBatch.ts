/**
 * applyBatch: one batch csv of patch rows landed through the commands: the export rows first, through the stage's add
 * commands and set as exportLanding maps them, then a value through set, a fold or merge row through merge, an ack
 * file's rows through ack; a stale row is held, a row already in place is left, nothing is forced.
 * @dev review: src/cli/session.ts, src/cli/commands/set.ts, src/migrate/exportLanding.ts
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parse } from 'csv-parse/sync';
import { ack } from '../cli/commands/ack';
import { merge } from '../cli/commands/merge';
import { FOLDER_FIELDS, set } from '../cli/commands/set';
import { Session, type Call } from '../cli/session';
import { today } from '../cli/writeCommand';
import { cellOf, PATCH_COLUMNS, UNKNOWN, type PatchRow } from '../import/applyPatch';
import { fileOf } from '../registry';
import { homeOf } from '../registry/layout';
import { blockNames, fieldPath, type TableName } from '../schema';
import { date } from '../schema/primitives';
import { getAt, stepsOf, type Step } from '../utils/fieldPath';
import { exportLanding } from './exportLanding';
import { countsOf, writeLandReport } from './landReport';

export interface ApplyOptions {
  batch: string;
  root: string;
  out: string;
  dryRun: boolean;
  patchDir: string;
  // The two exports the batch's export rows are cells of; without them each export row is held.
  exports?: { markets: string; platforms: string } | null;
}

type BatchRow = PatchRow & { decision?: string; target?: string };

const ACK_FILE = /^(?:\.\.\/)?acks\/([^/]+)\.json$/;
const EXPORT_ROW = /^export:/;
const MERGE_PATHS = new Set(['fold', 'merge']);

// The import staged an organization or underlying at reference/<table>/<slug>.json, and a kind or class folder may have
// changed since, so a batch row that names it at a path it left finds it by slug.
const STAGED = /^reference\/(organizations|underlyings)\/(?:[^/]+\/)?([^/]+)\.json$/;

const resolveFile = (session: Session, file: string): string => {
  if (session.exists(file)) return file;
  const staged = STAGED.exec(file);
  const slug = staged?.[2] ?? /^assets\/([^/]+)\/platform\.json$/.exec(file)?.[1];
  if (!slug) return file;
  const rows = staged?.[1] === 'underlyings' ? session.registry.underlying : session.registry.organization;
  const row = rows.find((candidate) => candidate.slug === slug);
  return (row && fileOf(row)) ?? file;
};

// A path names a field as the staged row did, or as the file holds it; the file's block goes in front of a row field.
// A path into a block is the file's already, though the block share a field's name, as a market's tracks does.
const filePath = (table: TableName, path: string): string => {
  const [first, ...rest] = stepsOf(path);
  if (typeof first !== 'string' || (rest.length && blockNames(table).includes(first))) return path;
  const head = fieldPath(table, first);
  return [head, ...rest]
    .reduce<string>((at, step: Step) => (typeof step === 'number' ? `${at}[${step}]` : `${at}.${step}`), '')
    .slice(1);
};

// The cell as set reads a value: unknown or null for null, a JSON string unquoted, any other text as written.
const valueText = (cell: string): string => {
  if (cell === UNKNOWN || cell === 'null') return UNKNOWN;
  try {
    const parsed = JSON.parse(cell) as unknown;
    return typeof parsed === 'string' ? parsed : cell;
  } catch {
    return cell;
  }
};

const unread = (row: BatchRow, needsDay: boolean): string | null => {
  if (!row.source?.trim()) return 'a batch row needs a source';
  if (needsDay && !date.safeParse(row.fetchedAt).success)
    return `fetchedAt "${row.fetchedAt ?? ''}" is not a YYYY-MM-DD date`;
  return null;
};

const held = (id: string, reason: string): Call => ({ id, command: set, refuse: reason });

const setCall = (session: Session, id: string, row: BatchRow): Call => {
  const file = resolveFile(session, row.file);
  const table = homeOf(file)?.table;
  if (!table) return held(id, `${row.file}: no such registry file, and no organization or underlying of that slug`);
  const path = filePath(table, row.path);
  const steps = stepsOf(path);
  // An organization's kind and an underlying's class are the folder the file sits in, which set moves.
  const isKind = FOLDER_FIELDS[table] === path;
  const log = { source: row.source, fetchedAt: row.fetchedAt, agent: row.agent || 'apply' };
  return {
    id,
    command: set,
    options: { args: [file, path, valueText(row.new)], source: row.source },
    log,
    // The import's patch rule: a value in place is left, and a row whose old value is not the file's is stale.
    guard: ([planned], read) => {
      const current = isKind ? homeOf(file)!.implied : getAt(read(file), steps);
      const next = isKind ? valueText(row.new) : getAt(planned?.content, steps);
      if (cellOf(current) === cellOf(next) && (current !== undefined || next === null))
        return { skip: `${file} ${path} holds the value already` };
      if (cellOf(current) !== row.old)
        return { hold: `${file} ${path}: old value "${row.old}" is not the value found, "${cellOf(current)}"` };
      return null;
    },
  };
};

const mergeCall = (session: Session, id: string, row: BatchRow): Call => {
  if (row.decision && row.decision !== 'confirmed') return held(id, `decision is ${row.decision}, not confirmed`);
  const file = resolveFile(session, row.file);
  const table = homeOf(file)?.table;
  const drop = basename(row.file, '.json');
  const keep = row.target || row.new;
  if (table !== 'organization' && table !== 'underlying') {
    // A merge already applied leaves keep with a merge event that names drop.
    const kept = [...session.registry.organization, ...session.registry.underlying].some(
      (candidate) => candidate.slug === keep,
    );
    const noted = session.registry.event.some(
      (event) => event.kind === 'merge' && event.note?.startsWith(`merged ${drop} (`),
    );
    if (kept && noted) return { id, command: merge, skip: `${drop} is merged into ${keep} already` };
    return held(id, `${row.file}: no organization or underlying ${drop} in the registry`);
  }
  return {
    id,
    command: merge,
    options: {
      args: [table, keep, drop],
      reason: `${row.path} of "${row.old}" into ${keep}`,
      source: row.source,
      at: date.safeParse(row.fetchedAt).success ? row.fetchedAt : today(),
    },
  };
};

const ackCall = (id: string, rows: BatchRow[]): Call => {
  const field = (name: string) => rows.find((row) => row.path === name)?.new || undefined;
  const [first] = rows;
  return {
    id,
    command: ack,
    options: {
      args: [field('asset') ?? ''],
      guard: field('guard'),
      until: field('until'),
      reason: field('reason'),
      resolve: field('resolve'),
      from: field('from'),
      source: first!.source,
    },
    log: { source: first!.source, fetchedAt: first!.fetchedAt, agent: first!.agent || 'apply' },
  };
};

const readBatch = (file: string): BatchRow[] =>
  parse(readFileSync(file, 'utf8'), { columns: true, bom: true, skip_empty_lines: true }) as BatchRow[];

export const applyBatch = async (options: ApplyOptions) => {
  const started = Date.now();
  const rows = readBatch(options.batch);
  const missing = PATCH_COLUMNS.filter((column) => rows.length && !(column in rows[0]!));
  if (missing.length) throw new Error(`${options.batch} lacks the batch columns ${missing.join(', ')}`);
  const session = new Session(options.root, { dryRun: options.dryRun, patches: options.patchDir });
  const acks = new Map<string, BatchRow[]>();
  // The line in the csv, the header being line 1, names each row in the held file.
  const lineOf = new Map(rows.map((row, i) => [row, `${basename(options.batch)}:${i + 2}`]));
  const exportRows = rows.filter((row) => EXPORT_ROW.test(row.file));
  const unreadExports = exportRows.filter((row) => unread(row, true));
  for (const row of unreadExports) await session.land(held(lineOf.get(row)!, unread(row, true)!));
  const readable = exportRows.filter((row) => !unreadExports.includes(row));
  let dropped: string[] = [];
  if (readable.length && !options.exports)
    for (const row of readable)
      await session.land(
        held(lineOf.get(row)!, `${row.file}: an export row needs the exports; pass --markets and --platforms`),
      );
  else if (readable.length) {
    const landing = exportLanding({
      rows: readable,
      ...options.exports!,
      root: options.root,
      lineOf: (row) => lineOf.get(row)!,
    });
    for (const call of landing.calls) await session.land(call);
    for (const { id, row } of landing.sets) await session.land(setCall(session, id, row));
    dropped = landing.dropped;
  }
  for (const row of rows) {
    const id = lineOf.get(row)!;
    if (EXPORT_ROW.test(row.file)) continue;
    if (ACK_FILE.test(row.file)) {
      acks.set(row.file, [...(acks.get(row.file) ?? []), row]);
      continue;
    }
    const isMerge = MERGE_PATHS.has(row.path);
    const why = unread(row, !isMerge);
    if (why) await session.land(held(id, why));
    else await session.land(isMerge ? mergeCall(session, id, row) : setCall(session, id, row));
  }
  for (const [file, group] of acks) {
    const id = `${lineOf.get(group[0]!)!} (${file})`;
    const why = unread(group[0]!, true);
    await session.land(why ? held(id, why) : ackCall(id, group));
  }
  const outcomes = await session.finish();
  const counts = countsOf(outcomes);
  const name = basename(options.batch, '.csv');
  const report = writeLandReport(options.out, 'apply', name, {
    read: [`Batch rows read: ${rows.length} from ${options.batch}, landed as ${outcomes.length} command calls.`],
    ...counts,
    extra: [
      ...(readable.length && options.exports
        ? [
            `Export rows: ${readable.length}, mapped over ${options.exports.markets} and ${options.exports.platforms}; files the new cells no longer write, left in place: ${dropped.length}${dropped.length ? `, first ${dropped.slice(0, 5).join(', ')}` : ''}.`,
          ]
        : []),
      ...(session.patchRows.length
        ? [
            `Source rows ${options.dryRun ? 'that would go' : 'appended'} to ${options.patchDir}: ${session.patchRows.length}.`,
          ]
        : []),
    ],
    seconds: (Date.now() - started) / 1000,
    dryRun: options.dryRun,
  });
  return { report, added: counts.added, present: counts.present, held: counts.held.length };
};
