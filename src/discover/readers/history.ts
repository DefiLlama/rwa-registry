/**
 * history: the first day DefiLlama stored a value for an asset on a chain, read from the asset's RWA chart on the Pro API.
 * This day is "first seen by DefiLlama", not the contract's creation: readDates asks it last, only for a deployment no explorer or node dated, and its day never replaces a date another source found.
 * A Solana mint that already holds a cursor asks it before walking more pages. A later creation-time source may replace a first-stored-day row.
 * @dev review: src/discover/readers/index.ts
 */
import type { DateQuery } from '../dateReader';
import { found, type DateResult } from '../dateResult';
import { askJson, type DiscoverDeps } from '../discoverDeps';

interface Leg {
  onChainMcap?: number | null;
  totalSupply?: number | null;
}

interface ChartRow {
  timestamp: number;
  chains?: Record<string, Leg> | null;
}

// One chart per asset and run, shared by all its deployments; a failed read is not kept, so the next deployment asks again.
const charts = new WeakMap<DiscoverDeps, Map<number, Promise<ChartRow[]>>>();

const chartUrl = (deps: DiscoverDeps, legacyId: number, key: string) =>
  `${deps.discover.sources.history.baseUrl.replace('{key}', key)}/chart/asset/${legacyId}`;

const chartOf = (legacyId: number, apiKey: string, deps: DiscoverDeps): Promise<ChartRow[]> => {
  if (!charts.has(deps)) charts.set(deps, new Map());
  const byId = charts.get(deps)!;
  if (!byId.has(legacyId)) {
    const read = askJson<ChartRow[]>(deps, 'history', { label: 'rwa chart', url: chartUrl(deps, legacyId, apiKey) });
    read.catch(() => byId.delete(legacyId));
    byId.set(legacyId, read);
  }
  return byId.get(legacyId)!;
};

// The chart names chains by DefiLlama's chain keys: the slug, its underscore form, or the keys config adds for the slug.
const keysOf = (chain: string, deps: DiscoverDeps) => [
  ...new Set([chain, chain.replace(/-/g, '_'), ...(deps.discover.sources.history.chartKeys[chain] ?? [])]),
];

const holds = (leg: Leg | undefined) => (leg?.totalSupply ?? 0) > 0 || (leg?.onChainMcap ?? 0) > 0;

// null when there is no key or no asset to ask, when the chart holds no value on the chain, or when two of the asset's
// deployments share the chain, since the chart's leg is their sum and its first day may belong to the other one.
export const firstStoredDay = async (query: DateQuery, deps: DiscoverDeps): Promise<DateResult | null> => {
  const { apiKey } = deps.discover.sources.history;
  const { asset } = query;
  if (!apiKey || !asset || asset.deploymentsOnChain > 1) return null;
  const rows = await chartOf(asset.legacyId, apiKey, deps);
  const keys = keysOf(query.chain, deps);
  const first = (Array.isArray(rows) ? rows : [])
    .filter((row) => keys.some((key) => holds(row.chains?.[key] ?? undefined)))
    .reduce<number | null>((min, { timestamp }) => (min === null || timestamp < min ? timestamp : min), null);
  return first === null ? null : found(first, null, chartUrl(deps, asset.legacyId, '<key>'), 'first-stored-day');
};
