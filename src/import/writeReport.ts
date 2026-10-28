/**
 * writeReport: report.md, unmapped.csv, calls.md and held/ under the output folder, the files a migration review reads.
 * @dev review: src/import/importExports.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Problem } from '../registry';
import { homeOf } from '../registry/layout';
import type { Registry, TableName } from '../schema';
import { TABLE_NAMES } from '../schema';
import { groupBy } from '../utils/groupBy';
import { toCsv } from '../utils/toCsv';
import type { PatchRow } from './applyPatch';
import { writeHeld } from './heldPatches';
import { RWA_ID, type Call, type Exports, type RegistryFiles, type Unmapped } from './importTypes';
import { UNLISTED_CHAINS } from './codeLists';
import { NO_CONTRACT } from './mapAssets';
import { keptDelistedIds } from './mapPerps';
import { MIGRATION_COUNTS } from './migrationCounts';
import { listOf, valueOf } from './readExport';

export interface ImportReport {
  rowsRead: { markets: number; platforms: number };
  written: number;
  unchanged: number;
  removed: number;
  files: RegistryFiles;
  registry: Registry;
  problems: Problem[];
  unmapped: Unmapped[];
  populations: Record<string, number>;
  counts: Record<string, number>;
  codeLists: Record<string, number>;
  calls: Call[];
  held: Record<string, PatchRow[]>;
  patchLog: string[];
  runtimeMs: number;
}

// Pairs not in CHAIN_MERGES that may still name one chain; a merged pair is one row and never listed.
const CHAIN_PAIRS = [['mantra', 'mantrachain']];
const GROUP_CALLS = [
  'AI & Compute Infrastructure',
  'RWA Infrastructure',
  'Energy',
  'Mixed Public & Private Markets',
  'Private Markets',
  'Crypto / Digital Assets',
];

const tableOf = (problem: Problem): string => {
  const nested = [...problem.path.matchAll(/(deployments|labels|roles|events)\[/g)].at(-1)?.[1];
  const child: Record<string, TableName> = {
    deployments: 'deployment',
    labels: 'address_label',
    roles: 'role',
    events: 'event',
  };
  return nested ? child[nested] : (homeOf(problem.file)?.table ?? 'other');
};

const withBudget = (title: string, body: string[]): string => {
  const budget = Math.ceil((body.length + 4) / 50) * 50;
  return [`# ${title}`, '', `> Budget: ${budget} lines`, '', ...body].join('\n') + '\n';
};

const count = (rows: Unmapped[], test: (row: Unmapped) => boolean) => rows.filter(test).length;

// A deployment needs an address, so a Chain item with no contract is not published; each row is listed for a call.
const chainsWithoutContract = (exports: Exports, unmapped: Unmapped[]): Call => {
  const items = groupBy(
    unmapped.filter((row) => row.reason === NO_CONTRACT),
    (row) => row.id,
  );
  const live = new Set(exports.markets.filter((row) => row.Delisted !== 'TRUE').map((row) => row[RWA_ID]));
  const listed = [...items].filter(([id]) => live.has(id));
  return {
    topic: 'chains',
    line: `${items.size} asset rows (${listed.length} listed) name a chain in Chain with no contract on it; the registry holds no deployment without an address, so the published chain list leaves it out. Add the address or drop the chain, per row (unmapped.csv, reason "${NO_CONTRACT}"); listed rows: ${listed.map(([id, rows]) => `${id} ${rows.length > 4 ? `${rows.length} chains` : rows.map((row) => row.value).join('/')}`).join('; ')}`,
  };
};

// The chains no DefiLlama list or sdk key names, each with its label and its deployments, for a person to place.
export const unlistedChains = (registry: Registry): Call => {
  const rows = registry.chain.filter((row) => UNLISTED_CHAINS.includes(row.slug));
  const deployments = (slug: string) => registry.deployment.filter((row) => row.chain === slug).length;
  return {
    topic: 'chains',
    line: `Chains in neither DefiLlama's chain list nor the sdk, kept as rows with the sheet's label: ${rows.map((row) => `${row.slug} (${row.label}, ${deployments(row.slug)} deployments)`).join(', ') || 'none'}. Give each a page name or merge it.`,
  };
};

export const callsOf = (exports: Exports, report: ImportReport): Call[] => {
  const { markets, platforms } = exports;
  const used = (column: string) => new Set(markets.flatMap((row) => listOf(row[column])));
  const ids = (test: (row: Record<string, string>) => boolean) => markets.filter(test).map((row) => row[RWA_ID]);
  const chains = new Set(report.registry.chain.map((row) => row.slug));
  const unmapped = report.unmapped;
  return [
    {
      topic: 'vocabulary',
      line: `Categories only on the Platforms tab: ${[...new Set(platforms.flatMap((row) => listOf(row.Category)))].filter((v) => !used('Category').has(v)).join(', ') || 'none'}.`,
    },
    ...GROUP_CALLS.map((group) => ({
      topic: 'vocabulary',
      line: `Asset group ${group}: ${ids((row) => row['Asset Group'] === group).length} rows, keep or merge.`,
    })),
    {
      topic: 'vocabulary',
      line: `RWA classification True RWA (${ids((row) => row['RWA Classification'] === 'True RWA').length} rows) against RWA (${ids((row) => row['RWA Classification'] === 'RWA').length}); Non-RWA (Platform) on ${ids((row) => row['RWA Classification'] === 'Non-RWA (Platform)').length} rows.`,
    },
    {
      topic: 'vocabulary',
      line: `Type Platform on live token rows: ${ids((row) => row.Type === 'Platform' && valueOf(row.Contracts) != null && row.Delisted !== 'TRUE').join(', ')}.`,
    },
    {
      topic: 'vocabulary',
      line: `Access model Custodial Only: rows ${ids((row) => row['Access Model'] === 'Custodial Only').join(', ')}.`,
    },
    {
      topic: 'rows',
      line: `Gold DAO GLD NFT rows ${ids((row) => (row.Delisted ?? '') === '' && /GLD/i.test(row.Ticker ?? '')).join(', ') || '9248 to 9251'}: live one to one; are they fungible?`,
    },
    {
      topic: 'rows',
      line: `Robinhood live rows with an Arbitrum and a Robinhood Chain leg: ${ids((row) => row['Parent Platform'] === 'Robinhood' && row.Delisted !== 'TRUE' && /arbitrum:/i.test(row.Contracts ?? '') && /robinhood:/i.test(row.Contracts ?? '')).length}; both legs imported.`,
    },
    ...CHAIN_PAIRS.filter((pair) => pair.filter((slug) => chains.has(slug)).length > 1).map((pair) => ({
      topic: 'chains',
      line: `Chains ${pair.filter((slug) => chains.has(slug)).join(' and ')} are written apart, one to one; merge one into the other as an alias?`,
    })),
    {
      topic: 'chains',
      line: `${report.codeLists['chain.label'] ?? 0} of ${report.registry.chain.length} chain labels are the server's rwaChainLabel of the export spelling, written in pass two; a merged spelling is an alias of its row (CHAIN_MERGES), and ${report.registry.chain.filter((row) => row.sdkKey != null).length} rows carry the sdk's chain key.`,
    },
    chainsWithoutContract(exports, unmapped),
    unlistedChains(report.registry),
    {
      topic: 'held',
      line: `${report.counts.heldRows} asset rows are held for a required value, ${count(unmapped, (row) => row.reason.startsWith('required'))} gaps: see unmapped.csv, reason "required".`,
    },
    {
      topic: 'held',
      line: `Held candidate patches: ${Object.entries(report.held)
        .map(([topic, rows]) => `${topic} ${rows.length}`)
        .join(', ')}.`,
    },
    {
      topic: 'rows',
      line: `${count(unmapped, (row) => row.reason.startsWith('wrapper'))} wrappers name no single listed ticker; wraps stays null.`,
    },
    {
      topic: 'rows',
      line: `One ISIN on several assets, or on an asset and an underlying, is written on each, and validate lists it as shared-isin. ${report.registry.asset.filter((row) => row.isinNote != null).length} assets keep their ISIN cell as written in isinNote, since it holds more than its codes.`,
    },
    {
      topic: 'venues',
      line: `Venues with no adapter: ${count(unmapped, (row) => row.reason === 'venue with no adapter')}; deployerFeeShare is not read by the import and stays null.`,
    },
    ...keptDelistedIds(exports).map(({ marketId, kept, live }) => ({
      topic: 'merged markets: is the kept legacy id the served one?',
      line: `${marketId} keeps ${kept}, a delisted row's id; the live row whose facts are kept is ${live}.`,
    })),
    {
      topic: 'dates',
      line: `${report.registry.deployment.filter((row) => row.deployedAt == null).length} deployments have no deployedAt; validate --out lists each in audit/undated-deployment.csv. No dates dump was given: every delisting date is null.`,
    },
  ];
};

export const writeReport = (out: string, report: ImportReport): void => {
  mkdirSync(join(out, 'held'), { recursive: true });
  const homes = new Map<string, number>();
  for (const path of report.files.keys()) {
    const home = path.replace(/\/[^/]+\.json$/, '').replace(/^(assets|perps)\/[^/]+$/, '$1/<folder>');
    homes.set(home, (homes.get(home) ?? 0) + 1);
  }
  const problems = new Map<string, { errors: number; warnings: number }>();
  for (const problem of report.problems) {
    const table = problems.get(tableOf(problem)) ?? { errors: 0, warnings: 0 };
    table[problem.severity === 'error' ? 'errors' : 'warnings'] += 1;
    problems.set(tableOf(problem), table);
  }
  const reasons = new Map<string, number>();
  for (const row of report.unmapped) {
    const key = `${row.column} | ${row.reason.replace(/:\s.*$/s, '')} | ${row.batch}`;
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  const counts = MIGRATION_COUNTS.map(({ key, label, expected, cause }) => {
    const got = report.counts[key] ?? 0;
    const difference = expected == null ? '' : got - expected;
    return `| ${label} | ${got} | ${expected ?? ''} | ${difference === 0 ? '0' : difference} | ${difference === 0 ? '' : (cause ?? '')} |`;
  });
  const body = [
    `Pass 0 of the 2026-10-22 exports, run in ${(report.runtimeMs / 1000).toFixed(1)} s: ${report.rowsRead.markets} markets rows and ${report.rowsRead.platforms} Platforms rows read; ${report.written} files written, ${report.unchanged} unchanged, ${report.removed} removed.`,
    '',
    '## Rows per table',
    '',
    '| Table | Rows | Errors | Warnings |',
    '|---|---|---|---|',
    ...TABLE_NAMES.map(
      (table) =>
        `| ${table} | ${report.registry[table].length} | ${problems.get(table)?.errors ?? 0} | ${problems.get(table)?.warnings ?? 0} |`,
    ),
    '',
    '## Files written per home',
    '',
    '| Home | Files |',
    '|---|---|',
    ...[...homes].map(([home, n]) => `| ${home} | ${n} |`),
    '',
    '## Populations',
    '',
    '| Population | Rows |',
    '|---|---|',
    ...Object.entries(report.populations).map(([name, n]) => `| ${name} | ${n} |`),
    '',
    '## Counts',
    '',
    '| Count | Import | Planned | Difference | Cause |',
    '|---|---|---|---|---|',
    ...counts,
    '',
    '## Pass two: the server code lists (src/import/codeLists.ts)',
    '',
    '| Field | Rows filled |',
    '|---|---|',
    ...Object.entries(report.codeLists).map(([field, n]) => `| ${field} | ${n} |`),
    '',
    '## Unmapped by column and reason',
    '',
    '| Column, reason, batch | Rows |',
    '|---|---|',
    ...[...reasons].sort(([, a], [, b]) => b - a).map(([key, n]) => `| ${key} | ${n} |`),
    '',
    '## Batch log',
    '',
    ...(report.patchLog.length
      ? report.patchLog.map((line) => `- ${line}`)
      : ['- Pass 0 only: no batch patch applied yet.']),
  ];
  writeFileSync(join(out, 'report.md'), withBudget('Import report, pass 0', body));
  writeFileSync(join(out, 'unmapped.csv'), toCsv(['id', 'column', 'value', 'reason', 'batch'], report.unmapped));
  const topics = [...new Set(report.calls.map((call) => call.topic))];
  const calls = topics.flatMap((topic) => [
    `## ${topic}`,
    '',
    ...report.calls.filter((call) => call.topic === topic).map((call) => `- ${call.line}`),
    '',
  ]);
  writeFileSync(join(out, 'calls.md'), withBudget('Calls for Akif after cutover', calls));
  for (const [topic, rows] of Object.entries(report.held)) writeHeld(join(out, 'held'), topic, rows);
};
