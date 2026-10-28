/**
 * applyFolds: the decided underlying folds applied: each dropped spelling becomes an alias of the slug it folds into, and every row that named it follows.
 * @dev review: src/import/heldPatches.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parse } from 'csv-parse/sync';
import { moveReferencesBy } from '../registry';
import { homeOf } from '../registry/layout';
import { schemas, type TableName } from '../schema';
import type { FileJson, RegistryFiles } from './importTypes';

export interface Fold {
  file: string;
  decision: string;
  target: string;
}

// The import stages an underlying at its flat path, so a patch row names it by slug; importExports moves it into its class folder last.
export const stagedUnderlying = (slug: string) => `reference/underlyings/${slug}.json`;
export const isStagedUnderlying = (path: string) => /^reference\/underlyings\/[^/]+\.json$/.test(path);

const FIELD_ORDER = [...Object.keys(schemas.underlying.shape), 'roles', 'events'];

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const uniqueBy = (items: unknown[], key: (item: unknown) => string) => {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(key(item)) && Boolean(seen.add(key(item))));
};

const merged = (kept: FileJson, dropped: FileJson): FileJson => {
  const aliases = [...new Set([...list(kept.aliases), dropped.name, ...list(dropped.aliases)])].filter(
    (alias) => alias !== kept.name,
  );
  const both = (field: string) => [...list(kept[field]), ...list(dropped[field])];
  const json: FileJson = {
    ...dropped,
    ...kept,
    aliases,
    identifiers: uniqueBy(both('identifiers'), (item) => {
      const { scheme, value } = item as { scheme: string; value: string };
      return `${scheme} ${value}`;
    }),
    roles: uniqueBy(both('roles'), (item) => JSON.stringify(item)),
    events: uniqueBy(both('events'), (item) => JSON.stringify(item)),
  };
  return Object.fromEntries(
    FIELD_ORDER.filter((key) => key in json && !(Array.isArray(json[key]) && list(json[key]).length === 0)).map(
      (key) => [key, json[key]],
    ),
  );
};

export const readFolds = (file: string): Fold[] =>
  existsSync(file) ? parse(readFileSync(file, 'utf8'), { columns: true, bom: true, skip_empty_lines: true }) : [];

export const applyFolds = (input: RegistryFiles, folds: Fold[]) => {
  const files: RegistryFiles = new Map(input);
  const into = new Map(
    folds.filter((fold) => fold.decision === 'confirmed').map((fold) => [basename(fold.file, '.json'), fold.target]),
  );
  const finalOf = (slug: string, seen: Set<string>): string =>
    into.has(slug) && !seen.has(slug) ? finalOf(into.get(slug)!, seen.add(slug)) : slug;
  const missing: string[] = [];
  const moved = new Map<string, string>();
  let roles = 0;
  for (const [drop, target] of into) {
    const keep = finalOf(target, new Set([drop]));
    const dropped = files.get(stagedUnderlying(drop)) as FileJson | undefined;
    const kept = files.get(stagedUnderlying(keep)) as FileJson | undefined;
    if (!dropped || !kept || keep === drop) {
      missing.push(`${drop} into ${target}: no underlying ${dropped ? keep : drop}`);
      continue;
    }
    files.set(stagedUnderlying(keep), merged(kept, dropped));
    files.delete(stagedUnderlying(drop));
    roles += list(dropped.roles).length;
    moved.set(drop, keep);
  }
  const repointed: Partial<Record<TableName, number>> = { role: roles };
  if (moved.size) {
    const rename = (key: string) => moved.get(key) ?? key;
    for (const [path, json] of files) {
      const table = homeOf(path)?.table;
      if (!table) continue;
      const next = moveReferencesBy(table, json, 'underlying', rename) as FileJson;
      if (JSON.stringify(next) === JSON.stringify(json)) continue;
      files.set(path, next);
      repointed[table] = (repointed[table] ?? 0) + 1;
    }
  }
  return { files, folded: moved.size, repointed, missing };
};
