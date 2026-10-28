/**
 * gate: a USDT contract's create_time from the contracts list, in seconds.
 * @dev review: src/discover/listings/listingReader.ts
 */
import { fromField, venueUrl, type ListingReader } from './listingReader';
import { askJson } from '../discoverDeps';

export const gate: ListingReader = {
  adapter: 'gate',
  read: async (targets, deps) => {
    const url = `${venueUrl(deps, 'gate')}/contracts`;
    const rows = await askJson<{ name: string; create_time?: number }[]>(deps, 'listings', { label: 'gate', url });
    return fromField(
      targets,
      new Map((Array.isArray(rows) ? rows : []).map((row) => [row.name, row.create_time])),
      1,
      url,
    );
  },
};
