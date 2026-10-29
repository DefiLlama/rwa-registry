/**
 * discoverDates: the undated deployments and the markets with no listing event, read in batches and appended to a patch csv; rows it holds are skipped and a capped read resumes from its cursor. Each chain is its own lane of batches and the lanes run side by side, so a slow chain never holds a fast one.
 * @dev review: src/discover/readers/index.ts, src/discover/listings/index.ts, src/utils/patchCsv.ts
 */
import { existsSync } from 'node:fs';
import { marketTarget, type VenueTarget } from './listings/listingReader';
import { appendPatchFile, readPatches, UNKNOWN, type PatchRow } from '../utils/patchCsv';
import { chainIdOf } from '../registry';
import { placeOf, type Place } from '../registry/place';
import type { Registry } from '../schema';
import { chunk } from '../utils/chunk';
import { groupBy } from '../utils/groupBy';
import { dayOf } from '../utils/days';
import type { DateQuery } from './dateReader';
import type { DateResult } from './dateResult';
import type { DiscoverDeps } from './discoverDeps';
import type { PaceStats } from './paced';
import { listingEvent, readListings } from './listings';
import { readDates } from './readers';
import { TRANSIENT, type DiscoverReason } from './reasons';

export interface DatesOptions {
  out: string;
  platform?: string;
  chain?: string;
  venue?: string;
  limit?: number;
  dryRun?: boolean;
}

export type Fate = 'asked again' | 'written unknown' | 'resumes from its cursor';

// One lane is one chain's deployments, or the market listings.
export interface LaneSummary {
  asked: number;
  found: number;
  nulls: Partial<Record<DiscoverReason, number>>;
  seconds: number;
}

export interface SourceSummary {
  calls: number;
  failed: PaceStats['failed'];
  seconds: number;
}

export interface DatesSummary {
  asked: number;
  held: number;
  found: number;
  nulls: Partial<Record<DiscoverReason, { count: number; fate: Fate; detail: string | null }>>;
  rows: PatchRow[];
  lanes: Record<string, LaneSummary>;
  sources: Record<string, SourceSummary>;
}

const BATCH = 25;
const AGENT = 'discover dates';
const LISTING = 'listing';
const LISTINGS_LANE = 'listings';
const RESUME = / \(resume before (\S+)\)$/;

interface Work<Q> {
  place: Place;
  held: string;
  query: Q;
}

const heldOf = ({ file, path }: Place, isListing: boolean) => (isListing ? `${file}|${LISTING}` : `${file}|${path}`);

// A cursor row is not held: its latest cursor is where the next read of that place starts.
const heldRows = (out: string) => {
  const held = new Set<string>();
  const cursors = new Map<string, string>();
  for (const row of existsSync(out) ? readPatches(out) : []) {
    const key = heldOf(row, row.path.startsWith('events') && row.new.includes(LISTING));
    const cursor = RESUME.exec(row.agent)?.[1];
    if (cursor) cursors.set(key, cursor);
    else held.add(key);
  }
  return { held, cursors };
};

const deploymentWork = (
  registry: Registry,
  { platform, chain: only }: Pick<DatesOptions, 'platform' | 'chain'>,
  cursors: Map<string, string>,
): Work<DateQuery>[] => {
  const platformOf = new Map(registry.asset.map((asset) => [asset.slug, asset.platform]));
  const legacyIdOf = new Map(registry.asset.map((asset) => [asset.slug, asset.legacyId]));
  const chains = new Map(registry.chain.map((chain) => [chain.slug, chain]));
  // How many of an asset's deployments sit on one chain, dated or not, since the history source reads one leg per chain.
  const onChain = new Map<string, number>();
  for (const row of registry.deployment)
    onChain.set(`${row.asset} ${row.chain}`, (onChain.get(`${row.asset} ${row.chain}`) ?? 0) + 1);
  return registry.deployment
    .filter(
      (row) =>
        !row.deployedAt &&
        (!platform || platformOf.get(row.asset) === platform) &&
        (!only || row.chain === only) &&
        chains.has(row.chain),
    )
    .map((row) => {
      const chain = chains.get(row.chain)!;
      const place = placeOf('deployment', row, 'deployedAt');
      const held = heldOf(place, false);
      const before = cursors.get(held) ?? null;
      const query = { chain: chain.slug, chainId: chainIdOf(chain), family: chain.addressFamily, address: row.address };
      const legacyId = legacyIdOf.get(row.asset);
      const asset =
        legacyId === undefined
          ? undefined
          : { legacyId, deploymentsOnChain: onChain.get(`${row.asset} ${row.chain}`) ?? 1 };
      return { place, held, query: { ...query, before, asset } };
    });
};

const marketWork = (registry: Registry, venue: string | undefined): Work<VenueTarget>[] => {
  const venues = new Map(registry.venue.map((row) => [row.slug, row]));
  const events = registry.event.map((event) => ({ event, place: placeOf('event', event) }));
  return registry.perp_market
    .filter((market) => (!venue || market.venue === venue) && venues.has(market.venue))
    .flatMap((market) => {
      const { file } = placeOf('perp_market', market);
      const own = events.filter(({ place }) => place.file === file && /^events\[\d+\]$/.test(place.path));
      if (own.some(({ event }) => event.kind === LISTING)) return [];
      const place = { file, path: `events[${own.length}]` };
      return [{ place, held: heldOf(place, true), query: marketTarget(market, venues.get(market.venue)!) }];
    });
};

const fateOf = (result: DateResult, isListing: boolean): Fate | null => {
  if (result.date !== null) return null;
  if (result.cursor) return 'resumes from its cursor';
  // A listing never lands as unknown, since an event row cannot be null; a family with no reader costs nothing to ask again.
  if (
    isListing ||
    TRANSIENT.has(result.reason) ||
    result.reason === 'no-reader' ||
    result.reason === 'needs-history-dump'
  )
    return 'asked again';
  return 'written unknown';
};

const rowOf = (place: Place, result: DateResult, today: string, isListing: boolean): PatchRow | null => {
  const base = { ...place, old: '', fetchedAt: today, verified: '' };
  if (result.date !== null)
    return {
      ...base,
      new: isListing ? JSON.stringify(listingEvent(result)) : result.date,
      source: result.source,
      agent: `${AGENT} (${result.basis})`,
    };
  const fate = fateOf(result, isListing);
  if (fate === 'asked again') return null;
  return {
    ...base,
    new: UNKNOWN,
    source: `${result.reason}: ${result.source ?? 'no source answered'}`,
    agent: fate === 'resumes from its cursor' ? `${AGENT} (resume before ${result.cursor})` : AGENT,
  };
};

export const discoverDates = async (
  registry: Registry,
  options: DatesOptions,
  deps: DiscoverDeps,
): Promise<DatesSummary> => {
  const { held, cursors } = heldRows(options.out);
  const today = dayOf(deps.now);
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const fresh = <Q>(work: Work<Q>[]) => work.filter((item) => !held.has(item.held));
  const deployments = options.venue && !options.platform ? [] : fresh(deploymentWork(registry, options, cursors));
  const markets =
    (options.platform || options.chain) && !options.venue ? [] : fresh(marketWork(registry, options.venue));
  const summary: DatesSummary = { asked: 0, held: held.size, found: 0, nulls: {}, rows: [], lanes: {}, sources: {} };
  const takenDeployments = deployments.slice(0, limit);
  const takenMarkets = markets.slice(0, Math.max(0, limit - takenDeployments.length));
  const total = takenDeployments.length + takenMarkets.length;

  const record = (lane: string, items: Work<unknown>[], results: DateResult[], isListing: boolean) => {
    const own = summary.lanes[lane];
    const rows = results.flatMap((result, index) => {
      summary.asked++;
      own.asked++;
      if (result.date !== null) {
        summary.found++;
        own.found++;
      } else {
        const seen = summary.nulls[result.reason];
        const detail = seen?.detail ?? result.detail ?? result.source;
        summary.nulls[result.reason] = { count: (seen?.count ?? 0) + 1, fate: fateOf(result, isListing)!, detail };
        own.nulls[result.reason] = (own.nulls[result.reason] ?? 0) + 1;
      }
      const row = rowOf(items[index].place, result, today, isListing);
      return row ? [row] : [];
    });
    summary.rows.push(...rows);
    if (!options.dryRun && rows.length) appendPatchFile(options.out, rows);
    const at = new Date().toISOString().slice(0, 19);
    deps.log(
      `${at}Z discover dates ${lane}: ${own.asked} asked, ${own.found} dated; all lanes ${summary.asked} of ${total} asked, ${summary.found} dated`,
    );
  };

  const lane = async <Q>(
    name: string,
    work: Work<Q>[],
    read: (queries: Q[], deps: DiscoverDeps) => Promise<DateResult[]>,
    isListing: boolean,
  ) => {
    const started = Date.now();
    summary.lanes[name] = { asked: 0, found: 0, nulls: {}, seconds: 0 };
    for (const batch of chunk(work, BATCH))
      record(
        name,
        batch,
        await read(
          batch.map(({ query }) => query),
          deps,
        ),
        isListing,
      );
    summary.lanes[name].seconds = Math.round((Date.now() - started) / 1000);
  };

  await Promise.all([
    ...[...groupBy(takenDeployments, ({ query }) => query.chain)].map(([chain, work]) =>
      lane(chain, work, readDates, false),
    ),
    ...(takenMarkets.length ? [lane(LISTINGS_LANE, takenMarkets, readListings, true)] : []),
  ]);
  for (const [name, { stats }] of Object.entries(deps.paced))
    if (stats.calls)
      summary.sources[name] = {
        calls: stats.calls,
        failed: stats.failed,
        seconds: Math.round((stats.lastEnd - stats.firstStart) / 1000),
      };
  return summary;
};
