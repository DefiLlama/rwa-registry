/**
 * tron: a TRC-20 contract's creation time from the Tronscan contract route.
 * @dev review: src/discover/readers/evm.ts
 */
import { eachQuery, type DateReader } from '../dateReader';
import { found, missing } from '../dateResult';
import { askJson } from '../discoverDeps';

export const tron: DateReader = {
  family: 'tron',
  read: eachQuery(async ({ address }, deps) => {
    const url = `${deps.discover.sources.tronscan.baseUrl}/contract?contract=${address}`;
    const body = await askJson<{ data?: { date_created?: number }[] }>(deps, 'tronscan', { label: 'tronscan', url });
    const created = body.data?.[0]?.date_created;
    return typeof created === 'number'
      ? found(created / 1000, null, url, 'contract-created')
      : missing('not-found', url);
  }),
};
