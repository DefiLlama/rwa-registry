/**
 * stages: the seven migrate stages in dependency order, which mapped files each lands, and the add command call each
 * file or value becomes, in the order its own references need.
 * @dev review: src/migrate/migrateStage.ts
 */
import { ack } from '../cli/commands/ack';
import { addAsset } from '../cli/commands/add-asset';
import { addChain } from '../cli/commands/add-chain';
import { addMarket } from '../cli/commands/add-market';
import { addOrganization } from '../cli/commands/add-organization';
import { addPlatform } from '../cli/commands/add-platform';
import { addRule } from '../cli/commands/add-rule';
import { addUnderlying } from '../cli/commands/add-underlying';
import { addValue } from '../cli/commands/add-value';
import { addVenue } from '../cli/commands/add-venue';
import type { SheetRow } from '../cli/addCommand';
import type { Call } from '../cli/session';
import type { FileJson, RegistryFiles } from '../import/importTypes';
import { CATEGORY_RULES_FILE } from '../registry/layout';
import { toRow } from '../schema';

export const STAGES = [
  'vocabularies',
  'chains',
  'organizations',
  'underlyings',
  'platforms',
  'assets',
  'markets',
] as const;
export type Stage = (typeof STAGES)[number];

const HOMES: [RegExp, Stage][] = [
  [/^reference\/vocabularies\/[^/]+\.json$/, 'vocabularies'],
  [/^reference\/chains\/[^/]+\.json$/, 'chains'],
  [/^reference\/organizations\/[^/]+\/[^/]+\.json$/, 'organizations'],
  [/^reference\/underlyings\/[^/]+\/[^/]+\.json$/, 'underlyings'],
  [/^assets\/[^/]+\/platform\.json$/, 'platforms'],
  [/^perps\/[^/]+\/(venue|organization)\.json$/, 'platforms'],
  [/^assets\/[^/]+\/[^/]+\.json$/, 'assets'],
  [/^\.\.\/acks\/[^/]+\.json$/, 'assets'],
  [/^perps\/[^/]+\/[^/]+\.json$/, 'markets'],
];

export const stageOf = (path: string): Stage | null => HOMES.find(([pattern]) => pattern.test(path))?.[1] ?? null;

// The ack command keeps its source in the patch csv; a code-list ack names the server lists it was copied from.
export const ACK_SOURCE =
  'defillama-server FLOWS_HIDDEN_IDS and RWA_ASSET_MOVE_ACKS, copied in src/import/codeLists.ts';

const segment = (path: string, index: number) => path.split('/')[index]!;
const sheet = (template: FileJson, operator?: FileJson): SheetRow => ({ template, operator });

// Calls in an order where each comes after the calls it names: a parent organization, a wrapped asset, a venue's parent.
interface Entry {
  call: Call;
  key: string;
  needs: string[];
}

const ordered = (calls: Entry[]): Call[] => {
  const byKey = new Map(calls.map((entry) => [entry.key, entry]));
  const done = new Set<string>();
  const out: Call[] = [];
  const visit = (entry: Entry, path: Set<string>) => {
    if (done.has(entry.key) || path.has(entry.key)) return;
    path.add(entry.key);
    for (const need of entry.needs) {
      const dependency = byKey.get(need);
      if (dependency) visit(dependency, path);
    }
    done.add(entry.key);
    out.push(entry.call);
  };
  for (const entry of calls) visit(entry, new Set());
  return out;
};

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : value == null ? [] : [String(value)];

// The stage's mapped files as add command calls; files is the import's mapping, in registry paths and file shape.
export const callsOf = (stage: Stage, files: RegistryFiles): Call[] => {
  const own = [...files].filter(([path]) => stageOf(path) === stage) as [string, FileJson | FileJson[]][];
  const one = own.filter((entry): entry is [string, FileJson] => !Array.isArray(entry[1]));

  if (stage === 'vocabularies') {
    const calls = own.flatMap(([path, json]) => {
      const rows = json as FileJson[];
      if (path === CATEGORY_RULES_FILE)
        return rows.map((rule) => ({
          id: `${path}#${rule.structure}:${rule.exposure}`,
          command: addRule,
          input: sheet(rule),
        }));
      const vocabulary = path.replace(/^.*\/|\.json$/g, '');
      return rows.map((value) => ({
        id: `${path}#${value.slug}`,
        command: addValue,
        input: sheet({ vocabulary, ...value }),
      }));
    });
    // The values first, since a rule names an asset class, an asset group and categories.
    return calls.sort((a, b) => Number(a.command === addRule) - Number(b.command === addRule));
  }
  if (stage === 'chains')
    return one.map(([id, json]) => ({ id, command: addChain, input: sheet(toRow('chain', json)) }));
  if (stage === 'underlyings')
    return one.map(([id, json]) => ({
      id,
      command: addUnderlying,
      input: sheet({ class: segment(id, 2), ...toRow('underlying', json) }),
    }));
  if (stage === 'organizations' || stage === 'platforms') {
    const entries = one.flatMap(([id, json]): (Entry & { also: string | null })[] => {
      if (/^perps\/[^/]+\/organization\.json$/.test(id)) return [];
      if (/^perps\/[^/]+\/venue\.json$/.test(id)) {
        const venue = toRow('venue', json);
        const operatorPath = id.replace(/venue\.json$/, 'organization.json');
        const operator = files.get(operatorPath) as FileJson | undefined;
        const input = sheet(venue, operator && toRow('organization', operator));
        const call: Call = { id, command: addVenue, input };
        const needs = [`venue:${venue.parent}`, `organization:${venue.organization}`];
        return [{ call, key: `venue:${venue.slug}`, needs, also: `organization:${venue.organization}` }];
      }
      const row = toRow('organization', json);
      const platform = stage === 'platforms';
      const template = platform ? row : { kind: segment(id, 2), ...row };
      const call: Call = { id, command: platform ? addPlatform : addOrganization, input: sheet(template) };
      // A role may name a venue's operator, which lands with its venue, so the venue comes first.
      const roles = ((row.roles as FileJson[] | undefined) ?? []).map((role) => role.organization);
      const needs = [...list(row.parent), ...list(row.parentPlatform), ...list(roles)].map(
        (slug) => `organization:${slug}`,
      );
      return [{ call, key: `organization:${row.slug}`, needs, also: null }];
    });
    // A venue's call lands its operator too, so a row that names the operator waits for the venue.
    const aliases = entries.filter((entry) => entry.also).map((entry) => ({ ...entry, key: entry.also! }));
    const keyed = [...entries, ...aliases.filter((alias) => !entries.some((entry) => entry.key === alias.key))];
    const calls = ordered(keyed);
    return calls.filter((call, i) => calls.indexOf(call) === i);
  }
  if (stage === 'assets') {
    const holderOf = new Map<string, string>();
    const assets = one.filter(([id]) => id.startsWith('assets/'));
    for (const [, json] of assets)
      for (const deployment of (json.deployments as FileJson[] | undefined) ?? [])
        holderOf.set(`${deployment.chain}:${deployment.address}`, String((json.identity as FileJson).slug));
    const entries = assets.map(([id, json]) => {
      const row = toRow('asset', json);
      const bridged = ((row.deployments as FileJson[] | undefined) ?? []).flatMap((deployment) =>
        deployment.bridgedFrom ? [holderOf.get(String(deployment.bridgedFrom)) ?? ''] : [],
      );
      const needs = [...list(row.wraps), ...bridged].map((slug) => `asset:${slug}`);
      const call: Call = { id, command: addAsset, input: sheet({ platform: segment(id, 1), ...row }) };
      return { call, key: `asset:${row.slug}`, needs };
    });
    const acks = one
      .filter(([id]) => id.startsWith('../acks/'))
      .map(([id, json]) => ({
        id,
        command: ack,
        options: {
          args: [String(json.asset)],
          guard: String(json.guard),
          until: json.until == null ? undefined : String(json.until),
          reason: String(json.reason),
          resolve: String(json.resolve),
          from: json.from == null ? undefined : String(json.from),
          source: ACK_SOURCE,
        },
      }));
    return [...ordered(entries), ...acks];
  }
  return one.map(([id, json]) => ({
    id,
    command: addMarket,
    input: sheet({ venue: segment(id, 1), ...toRow('perp_market', json) }),
  }));
};
