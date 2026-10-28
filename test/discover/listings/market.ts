/**
 * market: a hand-built venue target for the listing tests, Binance TSLAUSDT by default.
 * @dev review: src/discover/listings/listingReader.ts
 */
import type { VenueTarget } from '../../../src/discover/listings/listingReader';

export const market = (overrides: Partial<VenueTarget> = {}): VenueTarget => {
  const venue = overrides.venue ?? 'binance';
  return { venue, adapter: venue, symbol: 'TSLAUSDT', ...overrides };
};
