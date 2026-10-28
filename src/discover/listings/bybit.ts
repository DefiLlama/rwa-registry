/**
 * bybit: a linear market's launchTime from instruments-info, paged by its cursor.
 * @dev review: src/discover/listings/listingReader.ts
 */
import { fromField, venueUrl, type ListingReader } from './listingReader';
import { askJson } from '../discoverDeps';

const PAGE = 1000;
const MAX_PAGES = 20;

interface Page {
  result?: { list?: { symbol: string; launchTime?: string }[]; nextPageCursor?: string };
}

export const bybit: ListingReader = {
  adapter: 'bybit',
  read: async (targets, deps) => {
    const url = `${venueUrl(deps, 'bybit')}/instruments-info`;
    const launches = new Map<string, string | undefined>();
    let cursor = '';
    for (let page = 0; page < MAX_PAGES; page++) {
      const query = { category: 'linear', limit: PAGE, ...(cursor ? { cursor } : {}) };
      const body = await askJson<Page>(deps, 'listings', { label: 'bybit', url, query });
      for (const row of body.result?.list ?? []) launches.set(row.symbol, row.launchTime);
      cursor = body.result?.nextPageCursor ?? '';
      if (!cursor) break;
    }
    return fromField(targets, launches, 1000, `${url}?category=linear`);
  },
};
