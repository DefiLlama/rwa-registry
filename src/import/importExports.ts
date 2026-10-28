/**
 * importExports: the two exports and the patches mapped into registry/ files, only changed files written, then loaded, checked and reported.
 * @dev review: src/import/importContext.ts
 */
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ACKS_DIR, homeFile, loadRegistry, type Problem } from '../registry';
import { CATEGORY_RULES_FILE, homeOf } from '../registry/layout';
import { blockNames, toFile, type TableName } from '../schema';
import { writeFile } from '../utils/writeFile';
import type { VocabularyName } from '../schema';
import { applyCodeLists } from './applyCodeLists';
import { FEED_CHAINS } from './codeLists';
import { applyFolds, isStagedUnderlying, readFolds, stagedUnderlying, type Fold } from './applyFolds';
import { applyDates, readDates } from './applyDates';
import { checkPatches, patchExports, patchFiles, readPatches, type PatchRow } from './applyPatch';
import { issuerMerges, organizationHomes, underlyingFolds } from './heldPatches';
import { importContext } from './importContext';
import type { Exports, FileJson, RegistryFiles } from './importTypes';
import { mapAssets } from './mapAssets';
import { mapPerps } from './mapPerps';
import { withoutUntracked } from './mapUnderlyings';
import { applyOracleMap, readOracleMap } from './oracleMap';
import { applyTaxonomy } from './applyTaxonomy';
import { homeOrganizations } from './homeOrganizations';
import { moveFields } from './moveFields';
import { perpsNames } from './perpsNames';
import { perpsTickerCalls } from './perpsTickers';
import { importCounts } from './importCounts';
import { MARKETS_COLUMNS, PLATFORMS_COLUMNS } from './exportColumns';
import { readExport } from './readExport';
import { rowFate } from './rowFate';
import { callsOf, writeReport, type ImportReport } from './writeReport';

export interface ImportOptions {
  markets: string;
  platforms: string;
  root: string;
  out: string;
  patches?: string | null;
  dates?: string | null;
}

// The folders the import owns; a file there that the import no longer writes is removed, vocabularies are merged.
const OWNED = [ACKS_DIR, 'assets', 'perps', 'reference/chains', 'reference/organizations', 'reference/underlyings'];

const readJsonDir = (dir: string): Map<string, FileJson | FileJson[]> =>
  new Map(
    existsSync(dir)
      ? readdirSync(dir)
          .filter((name) => name.endsWith('.json'))
          .map((name) => [name.replace(/\.json$/, ''), JSON.parse(readFileSync(join(dir, name), 'utf8'))])
      : [],
  );

const listJson = (root: string, dir: string): string[] =>
  existsSync(join(root, dir))
    ? readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
    : [];

// The last step: each staged underlying moves into the folder of its class, which the file then leaves out.
const homeUnderlyings = (files: RegistryFiles): RegistryFiles =>
  new Map(
    [...files].map(([path, json]) => {
      if (!isStagedUnderlying(path) || Array.isArray(json)) return [path, json];
      const { class: _, ...file } = json;
      return [homeFile('underlying', json), file];
    }),
  );

// The files are staged flat, so a patch row names a field as the row does; each is written in its blocks last.
const nestFiles = (files: RegistryFiles): RegistryFiles =>
  new Map(
    [...files].map(([path, json]) => {
      const table = homeOf(path)?.table as TableName | undefined;
      return [path, table && !Array.isArray(json) && blockNames(table).length ? toFile(table, json) : json];
    }),
  );

const readRules = (root: string): FileJson[] =>
  existsSync(join(root, CATEGORY_RULES_FILE)) ? JSON.parse(readFileSync(join(root, CATEGORY_RULES_FILE), 'utf8')) : [];

const writeRegistry = (root: string, files: RegistryFiles) => {
  let written = 0;
  for (const [path, json] of files) if (writeFile(join(root, path), json)) written += 1;
  const unchanged = files.size - written;
  const stale = OWNED.flatMap((dir) => listJson(root, dir)).filter((path) => !files.has(path));
  stale.forEach((path) => rmSync(join(root, path)));
  return { written, unchanged, removed: stale.length };
};

// The protocol ids the export lacks and a patch restores, and the parent protocols kept as written, one line each.
const protocolIdCalls = (exports: { markets: Record<string, string>[] }, patches: PatchRow[]) => {
  const patched = patches
    .filter((row) => row.file.startsWith('export:') && row.path === '*projectID')
    .map((row) => `${row.file.slice('export:'.length)} (${row.old || 'empty'} to ${row.new})`);
  const parents = exports.markets
    .filter((row) => /parent#/.test(row['*projectID'] ?? ''))
    .map((row) => `${row['*RWA ID']} (${(row['*projectID'].match(/parent#[a-z0-9-]+/g) ?? []).join(', ')})`);
  return [
    ...(patched.length
      ? [
          {
            topic: 'protocol ids',
            line: `${patched.length} rows whose export cell lacks the protocol ids the sheet serves now, patched: ${patched.join('; ')}`,
          },
        ]
      : []),
    ...(parents.length
      ? [
          {
            topic: 'protocol ids',
            line: `${parents.length} rows name a parent protocol, kept as written in projectId: ${parents.join('; ')}`,
          },
        ]
      : []),
  ];
};

export interface MapInput {
  read: Exports;
  root: string;
  patches: PatchRow[];
  dates: ReturnType<typeof readDates> | null;
  folds: Fold[];
}

// The exports read with their header checked, the import's first step and the migrate command's.
export const readExports = (markets: string, platforms: string): Exports => ({
  markets: readExport(markets, MARKETS_COLUMNS),
  platforms: readExport(platforms, PLATFORMS_COLUMNS),
});

// The exports, the patches, the dates and the decided folds mapped into the registry files by path, in their blocks and
// sorted, read against the vocabularies, rules and chains the registry under root holds; nothing is written.
export const mapExports = ({ read, root, patches, dates, folds: decided }: MapInput) => {
  const exports = patchExports(read, patches);
  const vocabularies = readJsonDir(join(root, 'reference/vocabularies')) as Map<VocabularyName, FileJson[]>;
  vocabularies.delete('category-rules' as VocabularyName);
  const context = importContext(exports, Object.fromEntries(vocabularies));
  const assets = mapAssets(exports, context);
  const perps = mapPerps(exports, context, assets.files);

  const files: RegistryFiles = new Map([...context.vocabularies.files]);
  for (const [path, file] of assets.files) files.set(path, file);
  for (const [slug, organization] of context.organizations.organizations) {
    const home = assets.platforms.has(slug) ? `assets/${slug}/platform.json` : `reference/organizations/${slug}.json`;
    files.set(home, organization);
  }
  for (const [slug, underlying] of context.underlyings.underlyings) files.set(stagedUnderlying(slug), underlying);
  for (const [path, file] of perps.files) files.set(path, file);
  const chains = readJsonDir(join(root, 'reference/chains')) as Map<string, FileJson>;
  for (const slug of FEED_CHAINS) context.chains.record(slug, 'evm', slug);
  for (const [path, file] of context.chains.files(chains)) files.set(path, file);

  const dated = applyDates(files, dates);
  const listed = applyCodeLists(dated);
  const oracle = applyOracleMap(listed.files, exports, readOracleMap(patches));
  const patched = patchFiles(oracle.files, patches);
  const folds = applyFolds(patched.files, decided);
  const named = withoutUntracked(folds.files, context.underlyings.perpsOnly);
  const taxonomy = applyTaxonomy(named, readRules(root));
  const moved = moveFields(taxonomy.files);
  const homed = homeOrganizations(moved.files);
  const titled = perpsNames(homed.files);
  const sorted: RegistryFiles = new Map(
    [...nestFiles(homeUnderlyings(titled.files))].sort(([a], [b]) => a.localeCompare(b)),
  );
  return { exports, context, assets, perps, listed, oracle, patched, folds, taxonomy, moved, homed, titled, sorted };
};

export const importExports = (options: ImportOptions): ImportReport => {
  const started = Date.now();
  const checked = checkPatches(options.patches ? readPatches(options.patches) : []);
  const patches: PatchRow[] = checked.rows;
  const read = readExports(options.markets, options.platforms);
  const { exports, context, assets, perps, listed, oracle, patched, folds, taxonomy, moved, homed, titled, sorted } =
    mapExports({
      read,
      root: options.root,
      patches,
      dates: options.dates ? readDates(options.dates) : null,
      folds: readFolds(join(options.out, 'held', 'underlying-folds.csv')),
    });
  const { written, unchanged, removed } = writeRegistry(options.root, sorted);
  const loaded = loadRegistry(options.root);

  const unmapped = [
    ...context.organizations.unmapped,
    ...context.underlyings.unmapped,
    ...assets.unmapped,
    ...perps.unmapped,
    ...oracle.unmapped,
    ...patched.problems
      .filter((problem) => problem.severity === 'warning')
      .map((problem) => ({
        id: problem.file,
        column: problem.path,
        value: '',
        reason: problem.message,
        batch: 'patch',
      })),
  ];
  const imported = exports.markets.filter((row) => ['asset', 'perps'].includes(rowFate(row)));
  const { populations, counts } = importCounts({
    exports,
    platformsRead: read.platforms.length,
    registry: loaded.registry,
    files: sorted,
    unmapped,
    perpsUnmapped: perps.unmapped,
    heldRows: assets.held,
    vocabularyValues: context.vocabularies.values,
  });
  const refused = [...checked.problems, ...patched.problems.filter((problem) => problem.severity === 'error')];
  const nulled = patched.problems.filter((problem) => problem.severity === 'warning').length;

  const report: ImportReport = {
    rowsRead: { markets: read.markets.length, platforms: read.platforms.length },
    written,
    unchanged,
    removed,
    files: sorted,
    registry: loaded.registry,
    problems: [...refused, ...loaded.problems] as Problem[],
    unmapped,
    populations,
    counts,
    codeLists: listed.counts,
    calls: [],
    held: {
      'underlying-folds': underlyingFolds(imported, context.underlyings.slugOf),
      'issuer-merges': issuerMerges(
        [...exports.markets, ...exports.platforms],
        context.organizations.issuerOf,
        organizationHomes(homed.files),
      ),
    },
    patchLog: [
      ...(options.patches
        ? [
            `${patches.length + checked.problems.length} patch rows read from ${options.patches}: ${refused.length} refused, ${nulled} written as null; ${oracle.firms} oracle firms added.`,
            ...refused.map((problem) => `refused: ${problem.message}`),
          ]
        : []),
      ...(folds.folded || folds.missing.length
        ? [
            `${folds.folded} underlying folds applied from held/underlying-folds.csv; rows repointed: ${Object.entries(
              folds.repointed,
            )
              .map(([table, n]) => `${table} ${n}`)
              .join(', ')}.`,
            ...folds.missing.map((line) => `fold not applied: ${line}`),
          ]
        : []),
    ],
    runtimeMs: 0,
  };
  report.calls = [
    ...callsOf(exports, report),
    ...protocolIdCalls(exports, patches),
    ...homed.calls,
    ...moved.calls,
    ...taxonomy.calls,
    ...titled.calls,
    ...perpsTickerCalls(exports.markets, loaded.registry),
  ];
  report.runtimeMs = Date.now() - started;
  writeReport(options.out, report);
  return report;
};
