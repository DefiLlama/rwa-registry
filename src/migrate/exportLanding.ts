/**
 * exportLanding: a batch's export rows as what apply lands. The exports are mapped twice, as migrate --export-patches
 * maps them: once with each cell at its old value, once at its new value with the oracle map. A file only the second
 * mapping writes becomes its stage's add call, a value only it holds an add value or add rule call, a row it keeps in
 * another kind or class folder a set row that moves it, and each field the two differ in a set row whose old value is
 * the first mapping's.
 * @dev review: src/migrate/applyBatch.ts, src/migrate/stages.ts
 */
import { fileContent } from '../cli/addCommand';
import { FOLDER_FIELDS, set } from '../cli/commands/set';
import type { Call } from '../cli/session';
import { UNKNOWN, cellOf, type PatchRow } from '../import/applyPatch';
import { mapExports, readExports } from '../import/importExports';
import type { Exports, FileJson, RegistryFiles } from '../import/importTypes';
import { isOracleRow } from '../import/oracleMap';
import { CATEGORY_RULES_FILE, homeOf } from '../registry/layout';
import { toRow } from '../schema';
import { groupBy } from '../utils/groupBy';
import { isObject } from '../utils/isObject';
import { callsOf, STAGES } from './stages';

export interface ExportInput {
  rows: PatchRow[];
  markets: string;
  platforms: string;
  root: string;
  lineOf: (row: PatchRow) => string;
}

export interface ExportLanding {
  calls: Call[];
  sets: { id: string; row: PatchRow }[];
  // The files the first mapping writes and the second does not; they stay, and the report names them.
  dropped: string[];
}

type Change = [field: string, old: unknown, next: unknown];

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const keysOf = (...items: FileJson[]) => [...new Set(items.flatMap((item) => Object.keys(item)))];

// A file as an add command writes it: its blocks in schema order, nulls and empty lists left out.
const canonical = (path: string, json: FileJson): FileJson => {
  const table = homeOf(path)?.table;
  return table ? fileContent(table, toRow(table, json)) : json;
};

// Each field of a block apart, any other field whole, so a list of rows such as roles is set in one call.
const changesOf = (before: FileJson, after: FileJson): Change[] =>
  keysOf(before, after).flatMap((key): Change[] => {
    const [old, next] = [before[key], after[key]];
    const block =
      (isObject(old) || isObject(next)) && (isObject(old) || old == null) && (isObject(next) || next == null);
    if (!block) return same(old, next) ? [] : [[key, old, next]];
    const [a, b] = [(old ?? {}) as FileJson, (next ?? {}) as FileJson];
    return keysOf(a, b).flatMap((inner): Change[] =>
      same(a[inner], b[inner]) ? [] : [[`${key}.${inner}`, a[inner], b[inner]]],
    );
  });

// The cell set reads back: unknown for none, a string as written, any other value as JSON.
const cellText = (value: unknown) =>
  value == null ? UNKNOWN : typeof value === 'string' ? value : JSON.stringify(value);

const keyOfValue = (path: string, value: FileJson) =>
  path === CATEGORY_RULES_FILE ? `${value.structure}:${value.exposure}` : String(value.slug);

// What each oracle row or cell row names, found in a file it shaped that carries no RWA ID or PID.
const needleOf = (row: PatchRow): string | null => {
  if (!isOracleRow(row)) return row.new || null;
  try {
    const parsed = JSON.parse(row.new) as FileJson;
    return String(parsed.organization ?? parsed.slug ?? '') || null;
  } catch {
    return null;
  }
};

const mapped = (read: Exports, root: string, patches: PatchRow[]): RegistryFiles =>
  mapExports({ read, root, patches, dates: null, folds: [] }).sorted;

export const exportLanding = (input: ExportInput): ExportLanding => {
  const read = readExports(input.markets, input.platforms);
  const cells = input.rows.filter((row) => !isOracleRow(row));
  const before = mapped(
    read,
    input.root,
    cells.map((row) => ({ ...row, new: row.old })),
  );
  const after = mapped(read, input.root, input.rows);

  const byId = groupBy(cells, (row) => row.file.slice('export:'.length));
  const ownersOf = (path: string, json: FileJson): PatchRow[] => {
    const table = homeOf(path)?.table;
    const row = table ? toRow(table, json) : json;
    const id = row.legacyId != null ? String(row.legacyId) : row.legacyPid != null ? `PID ${row.legacyPid}` : null;
    const own = id ? (byId.get(id) ?? []) : [];
    if (own.length) return own;
    const text = JSON.stringify(json);
    const named = input.rows.filter((candidate) => {
      const needle = needleOf(candidate);
      return needle !== null && text.includes(JSON.stringify(needle));
    });
    return named.length ? named : input.rows;
  };
  const idOf = (owners: PatchRow[], what: string) =>
    `${input.lineOf(owners[0]!)}${owners.length > 1 ? ` (+${owners.length - 1} rows)` : ''} ${what}`;

  // A file at a new path whose row only the first mapping holds at another moved folder: an organization's kind or an
  // underlying's class changed, which set moves.
  const slugKey = (path: string, json: FileJson) => {
    const table = homeOf(path)?.table;
    return table && FOLDER_FIELDS[table] ? `${table}:${toRow(table, json).slug}` : null;
  };
  const gone = new Map(
    [...before]
      .filter(([path, json]) => !after.has(path) && !Array.isArray(json))
      .flatMap(([path, json]) => {
        const key = slugKey(path, json as FileJson);
        return key ? [[key, path] as const] : [];
      }),
  );
  const movedFrom = new Map(
    [...after]
      .filter(([path, json]) => !before.has(path) && !Array.isArray(json))
      .flatMap(([path, json]) => {
        const from = gone.get(slugKey(path, json as FileJson) ?? '');
        return from ? [[path, from] as const] : [];
      }),
  );

  const added: RegistryFiles = new Map();
  const calls: Call[] = [];
  const sets: ExportLanding['sets'] = [];
  const setRows = (path: string, old: FileJson, json: FileJson) => {
    const owners = ownersOf(path, json);
    for (const [field, was, next] of changesOf(canonical(path, old), canonical(path, json)))
      sets.push({
        id: idOf(owners, `${path} ${field}`),
        row: { ...owners[0]!, file: path, path: field, old: cellOf(was), new: cellText(next) },
      });
  };
  for (const [path, json] of after) {
    const old = before.get(path);
    if (Array.isArray(json)) {
      const known = new Map(((old ?? []) as FileJson[]).map((value) => [keyOfValue(path, value), value]));
      const fresh = json.filter((value) => !known.has(keyOfValue(path, value)));
      if (fresh.length) added.set(path, fresh);
      for (const value of json.filter((value) => known.has(keyOfValue(path, value)))) {
        if (same(value, known.get(keyOfValue(path, value)))) continue;
        const id = idOf(ownersOf(path, value), `${path}#${keyOfValue(path, value)}`);
        const refuse = `${path}: the export rows change the value ${keyOfValue(path, value)}; set it in the file`;
        calls.push({ id, command: set, refuse });
      }
      continue;
    }
    const from = movedFrom.get(path);
    if (from) {
      const table = homeOf(path)!.table;
      const field = FOLDER_FIELDS[table]!;
      const owners = ownersOf(path, json);
      const move = { ...owners[0]!, file: from, path: field, old: homeOf(from)!.implied!, new: homeOf(path)!.implied! };
      sets.push({ id: idOf(owners, `${from} ${field}`), row: move });
      setRows(path, before.get(from) as FileJson, json);
    } else if (old === undefined) added.set(path, json);
    else if (!Array.isArray(old)) setRows(path, old, json);
  }
  // A stage call is named by its file, or by its file and the value's key for a vocabulary value or a rule.
  const jsonOf = (id: string): FileJson => {
    const [path, key] = id.split('#') as [string, string | undefined];
    const json = added.get(path)!;
    return Array.isArray(json) ? json.find((value) => keyOfValue(path, value) === key)! : json;
  };
  for (const stage of STAGES)
    for (const call of callsOf(stage, added))
      calls.push({ ...call, id: idOf(ownersOf(call.id, jsonOf(call.id)), call.id) });
  const moved = new Set(movedFrom.values());
  const dropped = [...before.keys()].filter((path) => !after.has(path) && !moved.has(path));
  return { calls, sets, dropped };
};
