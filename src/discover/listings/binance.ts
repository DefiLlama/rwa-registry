/**
 * binance: a USD-M market's onboardDate from exchangeInfo, one call for every market.
 * @dev review: src/discover/listings/listingReader.ts
 */
import { fromField, venueUrl, type ListingReader } from './listingReader';
import { askJson } from '../discoverDeps';

export const binance: ListingReader = {
  adapter: 'binance',
  read: async (targets, deps) => {
    const url = `${venueUrl(deps, 'binance')}/exchangeInfo`;
    const info = await askJson<{ symbols?: { symbol: string; onboardDate?: number }[] }>(deps, 'listings', {
      label: 'binance',
      url,
    });
    return fromField(targets, new Map((info.symbols ?? []).map((row) => [row.symbol, row.onboardDate])), 1000, url);
  },
};
