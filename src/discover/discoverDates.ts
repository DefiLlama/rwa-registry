/**
 * discoverDates: the undated deployments and the markets with no listing event, read in batches; each date found is set in its registry file as its batch lands, so a dated deployment is never asked again. Each chain is its own lane of batches and the lanes run side by side, so a slow chain never holds a fast one.
 * @dev review: src/discover/readers/index.ts, src/discover/listings/index.ts, src/cli/writeAtomic.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeAtomic } from '../cli/writeAtomic';
import { chainIdOf, loadRegistry } from '../registry';
import { homeOf } from '../registry/layout';
import { placeOf, type Place } from '../registry/place';
import { inSchemaOrder, type Registry } from '../schema';
import { chunk } from '../utils/chunk';
import { setAt, stepsOf } from '../utils/fieldPath';
import { groupBy } from '../utils/groupBy';
import { jsonText } from '../utils/writeFile';
import type { DateQuery } from './dateReader';
import type { Basis, DateResult } from './dateResult';
import type { DiscoverDeps } from './discoverDeps';
import { listingEvent, readListings } from './listings';
import { marketTarget, type VenueTarget } from './listings/listingReader';
import type { PaceStats } from './paced';
import { readDates } from './readers';
import type { DiscoverReason } from './reasons';

export interface DatesOptions {
  platform?: string;
  chain?: string;
  venue?: string;
  limit?: number;
  dryRun?: boolean;
}

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

// One date found: the file and the path it is set at, the day, where it was read and on what basis; the file keeps the day only.
export interface Dated extends Place {
  date: string;
  source: string;
  basis: Basis;
}

// A null leaves its file as it was and is asked again on the next run; detail is the first one seen for the reason.
export interface DatesSummary {
  asked: number;
  dated: Dated[];
  nulls: Partial<Record<DiscoverReason, { count: number; detail: string | null }>>;
  lanes: Record<string, LaneSummary>;
  sources: Record<string, SourceSummary>;
}

const BATCH = 25;
const LISTING = 'listing';
const LISTINGS_LANE = 'listings';

interface Work<Q> {
  place: Place;
  query: Q;
}

const deploymentWork = (
  registry: Registry,
  { platform, chain: only }: Pick<DatesOptions, 'platform' | 'chain'>,
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
      const query = { chain: chain.slug, chainId: chainIdOf(chain), family: chain.addressFamily, address: row.address };
      const legacyId = legacyIdOf.get(row.asset);
      const asset =
        legacyId === undefined
          ? undefined
          : { legacyId, deploymentsOnChain: onChain.get(`${row.asset} ${row.chain}`) ?? 1 };
      return { place: placeOf('deployment', row, 'deployedAt'), query: { ...query, asset } };
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
      return [{ place, query: marketTarget(market, venues.get(market.venue)!) }];
    });
};

// The value set at its path in the file, written in schema order the way set writes a field.
const writeDated = (root: string, { file, path }: Place, value: unknown): void => {
  const table = homeOf(file)!.table;
  const json = JSON.parse(readFileSync(join(root, file), 'utf8')) as unknown;
  const content = inSchemaOrder(table, setAt(json, stepsOf(path), value));
  writeAtomic(root, [{ path: file, text: jsonText(content) }]);
};

export const discoverDates = async (root: string, options: DatesOptions, deps: DiscoverDeps): Promise<DatesSummary> => {
  const { registry } = loadRegistry(root);
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const deployments = options.venue && !options.platform ? [] : deploymentWork(registry, options);
  const markets = (options.platform || options.chain) && !options.venue ? [] : marketWork(registry, options.venue);
  const summary: DatesSummary = { asked: 0, dated: [], nulls: {}, lanes: {}, sources: {} };
  const takenDeployments = deployments.slice(0, limit);
  const takenMarkets = markets.slice(0, Math.max(0, limit - takenDeployments.length));
  const total = takenDeployments.length + takenMarkets.length;

  const record = (lane: string, items: Work<unknown>[], results: DateResult[], isListing: boolean) => {
    const own = summary.lanes[lane];
    results.forEach((result, index) => {
      summary.asked++;
      own.asked++;
      if (result.date === null) {
        const seen = summary.nulls[result.reason];
        const detail = seen?.detail ?? result.detail ?? result.source;
        summary.nulls[result.reason] = { count: (seen?.count ?? 0) + 1, detail };
        own.nulls[result.reason] = (own.nulls[result.reason] ?? 0) + 1;
        return;
      }
      own.found++;
      const { place } = items[index];
      summary.dated.push({ ...place, date: result.date, source: result.source, basis: result.basis });
      if (!options.dryRun) writeDated(root, place, isListing ? listingEvent(result) : result.date);
    });
    const at = new Date().toISOString().slice(0, 19);
    deps.log(
      `${at}Z discover dates ${lane}: ${own.asked} asked, ${own.found} dated; all lanes ${summary.asked} of ${total} asked, ${summary.dated.length} dated`,
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
