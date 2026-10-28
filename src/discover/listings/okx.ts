/**
 * okx: a swap's listTime from public/instruments, one call for every swap.
 * @dev review: src/discover/listings/listingReader.ts
 */
import { fromField, venueUrl, type ListingReader } from './listingReader';
import { askJson } from '../discoverDeps';

export const okx: ListingReader = {
  adapter: 'okx',
  read: async (targets, deps) => {
    const url = `${venueUrl(deps, 'okx')}/public/instruments`;
    const body = await askJson<{ data?: { instId: string; listTime?: string }[] }>(deps, 'listings', {
      label: 'okx',
      url,
      query: { instType: 'SWAP' },
    });
    return fromField(
      targets,
      new Map((body.data ?? []).map((row) => [row.instId, row.listTime])),
      1000,
      `${url}?instType=SWAP`,
    );
  },
};
