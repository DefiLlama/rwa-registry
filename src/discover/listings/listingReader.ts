/**
 * listingReader: the one shape of a venue's listing-date reader: its markets in, one DateResult each, from the venue's own listing field.
 * @dev review: src/discover/listings/index.ts
 */
import type { Row } from '../../schema';
import { found, missing, type DateResult } from '../dateResult';
import type { DiscoverDeps } from '../discoverDeps';

// One market as a venue's listing reader asks about it.
export interface VenueTarget {
  venue: string;
  adapter: string;
  symbol: string;
}

export const marketTarget = (market: { venue: string; symbol: string }, venue: Row<'venue'>): VenueTarget => ({
  venue: venue.slug,
  adapter: venue.adapter ?? venue.slug,
  symbol: market.symbol,
});

export interface ListingReader {
  adapter: string;
  read(targets: VenueTarget[], deps: DiscoverDeps): Promise<DateResult[]>;
}

export const venueUrl = (deps: DiscoverDeps, venue: string) => deps.config.venues[venue]?.urls.api ?? '';

// A market the venue's field dates, from its value in seconds or milliseconds; one it lacks is not-found.
export const fromField = (
  targets: VenueTarget[],
  values: Map<string, number | string | undefined>,
  perSecond: 1 | 1000,
  source: string,
): DateResult[] =>
  targets.map(({ symbol }) => {
    const value = values.get(symbol);
    return value === undefined || value === ''
      ? missing('not-found', source)
      : found(Number(value) / perSecond, null, source, 'listing-field');
  });
