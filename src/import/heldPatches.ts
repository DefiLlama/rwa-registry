/**
 * heldPatches: the underlying folds and issuer merges written to held/ and never applied, since each lands later as a reviewed data PR.
 * @dev review: src/import/writeReport.ts
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { rowSlug } from '../registry';
import { homeOf } from '../registry/layout';
import { groupBy } from '../utils/groupBy';
import { toCsv } from '../utils/toCsv';
import { PATCH_COLUMNS, type PatchRow } from './applyPatch';
import type { RegistryFiles } from './importTypes';
import { listOf, valueOf, type ExportRow } from './readExport';

const SHARE_CLASS_KEPT =
  /\b(inc|corp|corporation|co|ltd|plc|the|holdings|group|company|n v|nv|sa|se|ag|limited|incorporated)\b/g;
const LEGAL_SUFFIX =
  /\b(inc|ltd|limited|llc|corp|corporation|co|plc|ag|sa|gmbh|bv|lp|pte|uab|nv|the|s a|b v|l p|n v)\b/g;
const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

const underlyingName = (name: string) =>
  squash(
    name
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(SHARE_CLASS_KEPT, ' '),
  );
const issuerBase = (name: string) =>
  squash(
    name
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9()]+/g, ' ')
      .replace(LEGAL_SUFFIX, ' '),
  );
const withoutParenthetical = (name: string) => squash(issuerBase(name).replace(/\(.*?\)/g, ' '));

const held = (file: string, path: string, old: string, next: string, source: string): PatchRow => ({
  file,
  path,
  old,
  new: next,
  source,
  fetchedAt: '',
  agent: 'import pass 0',
  verified: '',
});

const groups = (names: string[], key: (name: string) => string): string[][] =>
  [...groupBy(names, key).values()].filter((group) => group.length > 1);

export const underlyingFolds = (rows: ExportRow[], slugOf: (spelling: string) => string | null): PatchRow[] => {
  const uses = new Map<string, number>();
  for (const row of rows) {
    const spelling = valueOf(row['Reference Asset']);
    if (spelling) uses.set(spelling, (uses.get(spelling) ?? 0) + 1);
  }
  return groups([...uses.keys()].sort(), underlyingName).flatMap((group) => {
    const [kept, ...folded] = [...group].sort((a, b) => uses.get(b)! - uses.get(a)! || a.localeCompare(b));
    return folded.map((name) =>
      held(
        `reference/underlyings/${slugOf(name)}.json`,
        'fold',
        name,
        slugOf(kept) ?? rowSlug(kept),
        'name rule: the names differ only by share-class words',
      ),
    );
  });
};

// Each organization's file by slug, as the layout homes it: the kind folder, a platform's asset folder or a venue's folder.
export const organizationHomes = (files: RegistryFiles): Map<string, string> =>
  new Map(
    [...files].flatMap(([path, json]): [string, string][] =>
      homeOf(path)?.table === 'organization' && !Array.isArray(json) ? [[String(json.slug), path]] : [],
    ),
  );

// A merge names the file of the organization it folds away; a name whose organization has no file has nothing to merge.
export const issuerMerges = (
  rows: ExportRow[],
  organizationOf: (item: string) => string,
  homes: Map<string, string>,
): PatchRow[] => {
  const items = [...new Set(rows.flatMap((row) => listOf(row.Issuer)))].sort();
  const bySuffix = groups(items, issuerBase);
  const byParenthetical = groups(items, withoutParenthetical).filter(
    (group) => new Set(group.map(issuerBase)).size > 1,
  );
  const mergesOf = (group: string[], rule: string) => {
    const [kept, ...rest] = [...group].sort((a, b) => a.length - b.length || a.localeCompare(b));
    return rest
      .filter((name) => organizationOf(name) !== organizationOf(kept) && homes.has(organizationOf(name)))
      .map((name) => held(homes.get(organizationOf(name))!, 'merge', name, organizationOf(kept), rule));
  };
  return [
    ...bySuffix.flatMap((group) => mergesOf(group, 'the names differ only by a legal suffix')),
    ...byParenthetical.flatMap((group) => mergesOf(group, 'the names differ only by a parenthetical')),
  ];
};

const patchKey = (row: Pick<PatchRow, 'file' | 'path' | 'old'>) => `${row.file}|${row.path}|${row.old}`;

// A held file that carries a decision column is never overwritten; candidates it lacks go to <topic>.new.csv.
export const writeHeld = (dir: string, topic: string, rows: PatchRow[]): void => {
  const target = join(dir, `${topic}.csv`);
  const fresh = join(dir, `${topic}.new.csv`);
  const decided: PatchRow[] = existsSync(target)
    ? parse(readFileSync(target, 'utf8'), { columns: true, bom: true, skip_empty_lines: true })
    : [];
  if (!decided.some((row) => 'decision' in row)) {
    writeFileSync(target, toCsv(PATCH_COLUMNS, rows));
    return;
  }
  const known = new Set(decided.map(patchKey));
  const added = rows.filter((row) => !known.has(patchKey(row)));
  if (added.length) writeFileSync(fresh, toCsv(PATCH_COLUMNS, added));
  else if (existsSync(fresh)) rmSync(fresh);
};
