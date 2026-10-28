/**
 * listings: a market's listing date from the venue's own field, else needs-history-dump; one line per field reader.
 * @dev review: src/discover/listings/listingReader.ts
 */
import type { VenueTarget } from './listingReader';
import { groupBy } from '../../utils/groupBy';
import { missing, missingOf, type DateFound, type DateResult } from '../dateResult';
import type { DiscoverDeps } from '../discoverDeps';
import { binance } from './binance';
import { bybit } from './bybit';
import { gate } from './gate';
import type { ListingReader } from './listingReader';
import { okx } from './okx';

export const listingReaders: ListingReader[] = [binance, bybit, okx, gate];

const byAdapter = new Map(listingReaders.map((reader) => [reader.adapter, reader]));

// A market its venue's field does not date waits for the venue's history dump.
const readVenue = async (id: string, targets: VenueTarget[], deps: DiscoverDeps): Promise<DateResult[]> => {
  const field = byAdapter.get(id);
  if (!field) return targets.map(() => missing('needs-history-dump'));
  const read = await field.read(targets, deps).catch((error: unknown) => targets.map(() => missingOf(error)));
  return read.map((result) =>
    result.reason === 'not-found'
      ? missing('needs-history-dump', result.source, { detail: 'the venue lists no date' })
      : result,
  );
};

export const readListings = async (targets: VenueTarget[], deps: DiscoverDeps): Promise<DateResult[]> => {
  const results = new Map<VenueTarget, DateResult>();
  await Promise.all(
    [...groupBy(targets, ({ adapter }) => adapter)].map(async ([id, group]) => {
      const read = await readVenue(id, group, deps);
      group.forEach((target, index) => results.set(target, read[index]));
    }),
  );
  return targets.map((target) => results.get(target)!);
};

// A listing is an event, since perp_market has no date field; its source is a link when it is a URL.
export const listingEvent = ({ date, source }: DateFound) => ({
  kind: 'listing',
  date,
  ...(source.startsWith('http') ? { links: [source] } : { note: source }),
});
