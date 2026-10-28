/**
 * Session: the registry loaded once, then many command calls landed in it in batches, each through its command's plan
 * with the same refusals and checks the command runs alone; a call that brings an error is held with it, never forced.
 * @dev review: src/cli/writeCommand.ts, src/cli/checkStaged.ts
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SchemaError } from '../errors';
import { CliError, NoSuchRowError, RowExistsError } from '../errors/cli';
import { checkRegistry, type Problem } from '../registry';
import {
  dropFile,
  emptyRegistry,
  isVocabularyFile,
  loadFile,
  loadVocabularyFile,
  registryFiles,
  vocabulariesOf,
} from '../registry/loadRegistry';
import { homeOf } from '../registry/layout';
import { problemId, toProblem } from '../registry/problem';
import { TABLE_NAMES, type Registry, type Vocabularies } from '../schema';
import { jsonText } from '../utils/writeFile';
import { appendPatchRows, type PatchRow, type PatchSource } from './patchRows';
import { writeAtomic } from './writeAtomic';
import {
  conflictsOf,
  loggedRows,
  readerOf,
  stagedOf,
  type FileToWrite,
  type FlagValues,
  type Staged,
  type WriteCommand,
} from './writeCommand';

export interface Call {
  // What the report and the held file name the call by: the row's file, or the batch line.
  id: string;
  command: WriteCommand;
  options?: FlagValues & { args?: string[] };
  input?: unknown;
  // The batch row's own source, which replaces the one the command writes to the patch csv.
  log?: PatchSource;
  // Set when the caller knows before any plan: the row is in place already, or it cannot land.
  skip?: string;
  refuse?: string;
  // A look at the planned files before they land: skip when they are in place already, hold when the row is stale.
  guard?: (files: FileToWrite[], read: (path: string) => unknown) => { skip?: string; hold?: string } | null;
}

export type Status = 'added' | 'present' | 'held';

export interface Outcome {
  id: string;
  status: Status;
  reason: string;
  files: string[];
}

interface Unit {
  call: Call;
  outcome: Outcome;
  files: Staged[];
}

// What memory held for a path: had is false when the disk's file, or no file, is the truth.
interface Held {
  had: boolean;
  value: unknown;
}

interface Snapshot {
  tables: Record<string, unknown[]>;
  problems: Map<string, Problem[]>;
  // What memory held for each touched path before the batch.
  touched: Map<string, Held>;
}

const errorsOf = (problems: Problem[]) => problems.filter((problem) => problem.severity === 'error');

export class Session {
  readonly outcomes: Outcome[] = [];
  readonly patchRows: PatchRow[] = [];
  registry: Registry = emptyRegistry();
  private vocabularies: Vocabularies = {};
  // Files changed in this session, written or not; null marks a removed file.
  private readonly memory = new Map<string, unknown>();
  private problems = new Map<string, Problem[]>();
  private known = new Set<string>();
  private pending: Unit[] = [];
  private snapshot: Snapshot | null = null;
  private replaying = false;

  constructor(
    readonly root: string,
    private readonly options: { dryRun: boolean; patches: string; batchSize?: number; base?: 'batch' | 'none' },
  ) {
    this.reload();
    this.known = new Set(this.errors(null).map(problemId));
  }

  exists = (path: string): boolean =>
    this.memory.has(path) ? this.memory.get(path) !== null : existsSync(join(this.root, path));

  read = (path: string): unknown => {
    if (!this.exists(path)) throw new NoSuchRowError({ file: join(this.root, path), message: 'no such registry file' });
    return this.memory.has(path) ? structuredClone(this.memory.get(path)) : readerOf(this.root)(path);
  };

  // One call planned, refused or staged in memory; its batch is checked when it fills and on finish.
  async land(call: Call): Promise<void> {
    const outcome: Outcome = { id: call.id, status: 'added', reason: '', files: [] };
    this.outcomes.push(outcome);
    await this.stage({ call, outcome, files: [] });
    if (!this.replaying && this.pending.length >= (this.options.batchSize ?? 250)) await this.flush();
  }

  async finish(): Promise<Outcome[]> {
    await this.flush();
    return this.outcomes;
  }

  private async stage(unit: Unit): Promise<void> {
    const { call, outcome } = unit;
    const hold = (reason: string, status: Status = 'held') => Object.assign(outcome, { status, reason, files: [] });
    if (call.skip) return void hold(call.skip, 'present');
    if (call.refuse) return void hold(call.refuse);
    let planned: FileToWrite[];
    try {
      planned = await call.command.plan(call.options ?? {}, this.registry, {
        root: this.root,
        read: this.read,
        note: () => {},
        input: call.input,
      });
    } catch (error) {
      if (error instanceof CliError) return void hold(`${error.file}: ${error.message}`);
      throw error;
    }
    const conflicts = conflictsOf(this.root, planned, this.exists);
    if (conflicts.length) {
      const [first] = conflicts;
      const present = conflicts.every((error) => error instanceof RowExistsError);
      return void hold(`${first!.file}: ${first!.message}`, present ? 'present' : 'held');
    }
    unit.files = stagedOf(planned, this.exists, this.read);
    // The guard sees the files as they would be written, identifiers marked as the command marks them.
    const verdict = call.guard?.(unit.files, this.read);
    if (verdict?.skip) return void hold(verdict.skip, 'present');
    if (verdict?.hold) return void hold(verdict.hold);
    this.snapshot ??= this.take();
    const prior = unit.files.map((file) => [file.path, this.held(file.path)] as const);
    for (const file of unit.files)
      this.put(file.path, { had: true, value: file.remove ? null : JSON.parse(file.text) });
    // A schema error is the call's own, so it is held at once and its files taken back.
    const own = unit.files.flatMap((file) => errorsOf(this.problems.get(file.path) ?? []));
    const fresh = own.filter((problem) => !this.known.has(problemId(problem)));
    if (fresh.length) {
      for (const [path, state] of [...prior].reverse()) this.put(path, state);
      return void hold(this.describe(fresh[0]!));
    }
    outcome.files = unit.files.map((file) => file.path);
    this.pending.push(unit);
  }

  // The batch checked as the command checks one call: the errors it brings that the registry did not have; a call whose
  // file holds one is held, the rest replayed on the registry without it, until the batch brings none.
  async flush(): Promise<void> {
    while (this.pending.length) {
      const fresh = this.errors(this.base()).filter((problem) => !this.known.has(problemId(problem)));
      if (!fresh.length) return this.commit();
      const owner = new Map<string, Unit>();
      for (const unit of this.pending) for (const file of unit.files) owner.set(file.path, unit);
      const guilty = new Map<Unit, Problem>();
      for (const problem of fresh) {
        const unit = owner.get(problem.file);
        if (unit && !guilty.has(unit)) guilty.set(unit, problem);
      }
      const units = this.pending;
      this.rollback();
      if (!guilty.size) {
        // An error on a file no call wrote, such as a reference a removal broke, is found by landing each call alone.
        if (units.length === 1) {
          Object.assign(units[0]!.outcome, { status: 'held', reason: this.describe(fresh[0]!), files: [] });
          continue;
        }
        for (const unit of units) {
          await this.replay([unit]);
          await this.flush();
        }
        return;
      }
      for (const [unit, problem] of guilty)
        Object.assign(unit.outcome, { status: 'held', reason: this.describe(problem), files: [] });
      await this.replay(units.filter((unit) => !guilty.has(unit)));
    }
  }

  private describe(problem: Problem): string {
    return `${join(this.root, problem.file)}: ${problem.message}`;
  }

  private async replay(units: Unit[]): Promise<void> {
    this.replaying = true;
    try {
      for (const unit of units) {
        Object.assign(unit.outcome, { status: 'added', reason: '', files: [] });
        await this.stage({ call: unit.call, outcome: unit.outcome, files: [] });
      }
    } finally {
      this.replaying = false;
    }
  }

  private commit(): void {
    const touched = [...(this.snapshot?.touched.keys() ?? [])].sort();
    const files = touched.flatMap((path) => {
      // A path a held call touched and gave back is the disk's again, so nothing is written for it.
      if (!this.memory.has(path)) return [];
      const value = this.memory.get(path);
      if (value !== null) return [{ path, text: jsonText(value) }];
      return existsSync(join(this.root, path)) ? [{ path, text: '', remove: true }] : [];
    });
    const rows = this.pending.flatMap(({ call, files }) =>
      files.flatMap((file) => {
        const log = file.log && (call.log ?? file.log);
        return log ? loggedRows({ ...file, content: file.remove ? null : JSON.parse(file.text) }, log) : [];
      }),
    );
    this.patchRows.push(...rows);
    if (!this.options.dryRun) {
      writeAtomic(this.root, files);
      for (const day of new Set(rows.map((row) => row.fetchedAt))) {
        appendPatchRows(
          this.options.patches,
          rows.filter((row) => row.fetchedAt === day),
        );
      }
    }
    this.pending = [];
    this.snapshot = null;
    this.known = new Set(this.errors(null).map(problemId));
  }

  // Every error of the registry in memory: the schema's per file and the checks', against base when one is given.
  private errors(base: Registry | null): Problem[] {
    const own = [...this.problems.values()].flat();
    return errorsOf([...own, ...checkRegistry(this.registry, base)]);
  }

  // The registry as the batch found it, which the checks compare new rows and frozen keys with, as checkStaged does;
  // none checks the rows as validate does without --base, for rows that are not new against main.
  private base(): Registry | null {
    if (this.options.base === 'none') return null;
    return this.snapshot ? (this.snapshot.tables as unknown as Registry) : null;
  }

  private take(): Snapshot {
    const tables = Object.fromEntries(TABLE_NAMES.map((table) => [table, [...this.registry[table]]]));
    return { tables, problems: new Map(this.problems), touched: new Map() };
  }

  private rollback(): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    for (const [path, state] of snapshot.touched) this.setMemory(path, state);
    for (const table of TABLE_NAMES)
      (this.registry as unknown as Record<string, unknown[]>)[table] = [...snapshot.tables[table]!];
    this.problems = new Map(snapshot.problems);
    this.vocabularies = vocabulariesOf(this.registry);
    this.pending = [];
    this.snapshot = null;
  }

  private held(path: string): Held {
    return { had: this.memory.has(path), value: this.memory.get(path) };
  }

  // One path set in memory, a file, null for removed, or back to the disk's, and its rows loaded again.
  private put(path: string, state: Held): void {
    const touched = this.snapshot!.touched;
    if (!touched.has(path)) touched.set(path, this.held(path));
    if (isVocabularyFile(path)) {
      this.setMemory(path, state);
      // A vocabulary changes what every other file's fields may hold, so the registry is loaded again around it.
      return this.reload();
    }
    // Only a path that held a file has rows to take out; a new file's are only added.
    if (this.exists(path)) dropFile(this.registry, path);
    this.problems.delete(path);
    this.setMemory(path, state);
    if (this.exists(path)) this.problems.set(path, this.loadOne(path, this.registry, this.vocabularies));
  }

  private setMemory(path: string, state: Held): void {
    if (state.had) this.memory.set(path, state.value);
    else this.memory.delete(path);
  }

  // One file's rows loaded into registry, or the problem that it is not JSON, as the loader reports it.
  private loadOne(path: string, registry: Registry, vocabularies: Vocabularies): Problem[] {
    if (!homeOf(path)) return loadFile(registry, path, null, vocabularies);
    let json: unknown;
    try {
      json = this.read(path);
    } catch (cause) {
      const message = `not valid JSON: ${(cause as Error).message}`;
      return [toProblem(new SchemaError({ file: path, path: '', message }))];
    }
    return isVocabularyFile(path)
      ? loadVocabularyFile(registry, path, json)
      : loadFile(registry, path, json, vocabularies);
  }

  // The whole registry loaded from disk with the files in memory laid over it.
  private reload(): void {
    const paths = new Set([...registryFiles(this.root), ...this.memory.keys()]);
    const live = [...paths].filter((path) => this.exists(path)).sort();
    const registry = emptyRegistry();
    const problems = new Map<string, Problem[]>();
    for (const path of live.filter(isVocabularyFile)) problems.set(path, this.loadOne(path, registry, {}));
    const vocabularies = vocabulariesOf(registry);
    for (const path of live.filter((path) => !isVocabularyFile(path)))
      problems.set(path, this.loadOne(path, registry, vocabularies));
    this.registry = registry;
    this.vocabularies = vocabularies;
    this.problems = problems;
  }
}
