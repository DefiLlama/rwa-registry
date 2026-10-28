/**
 * aptos: the first fungible-asset activity of a coin type or a fungible asset, from the Aptos indexer, which lists both under asset_type.
 * @dev review: src/discover/readers/index.ts
 */
import { ResponseShapeError } from '../../errors';
import { eachQuery, type DateReader } from '../dateReader';
import { found, missing } from '../dateResult';
import { askJson } from '../discoverDeps';

interface Answer {
  data?: { fungible_asset_activities?: { transaction_version: number | string; transaction_timestamp: string }[] };
  errors?: { message: string }[];
}

const queryOf = (assetType: string) =>
  `query { fungible_asset_activities(where: {asset_type: {_eq: "${assetType}"}}, order_by: {transaction_version: asc}, limit: 1) { transaction_version transaction_timestamp } }`;

export const aptos: DateReader = {
  family: 'aptos',
  read: eachQuery(async ({ address }, deps) => {
    const body = await askJson<Answer>(deps, 'aptos', {
      label: 'aptos indexer',
      url: deps.discover.sources.aptos.baseUrl,
      method: 'POST',
      body: { query: queryOf(address) },
    });
    if (body.errors?.length)
      throw new ResponseShapeError({
        source: 'aptos indexer',
        reason: 'bad-response',
        message: body.errors[0].message,
      });
    const first = body.data?.fungible_asset_activities?.[0];
    if (!first) return missing('not-found', `aptos indexer fungible_asset_activities ${address}`);
    const version = Number(first.transaction_version);
    // The indexer writes its timestamps in UTC without a zone.
    const seconds = Date.parse(`${first.transaction_timestamp}Z`) / 1000;
    return found(seconds, version, `https://explorer.aptoslabs.com/txn/${version}?network=mainnet`, 'first-activity');
  }),
};
