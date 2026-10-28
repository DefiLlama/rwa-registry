/**
 * importCounts: the populations of the export rows and the counts of the written files the report sets beside the planned ones.
 * @dev review: src/import/migrationCounts.ts
 */
import type { Registry } from '../schema';
import { MARKET_ID, type Exports, type FileJson, type RegistryFiles, type Unmapped } from './importTypes';
import { listOf } from './readExport';
import { rowFate } from './rowFate';

export interface CountInputs {
  exports: Exports;
  platformsRead: number;
  registry: Registry;
  files: RegistryFiles;
  unmapped: Unmapped[];
  perpsUnmapped: Unmapped[];
  heldRows: number;
  vocabularyValues: Record<string, number>;
}

const ASSET_FILE = /^assets\/[^/]+\/(?!platform\.json)[^/]+\.json$/;

const isDelisted = (file: FileJson) =>
  ((file.events as FileJson[] | undefined) ?? []).some((event) => event.kind === 'delisting');

const deploymentsOf = (list: FileJson[]) =>
  list.reduce((sum, asset) => sum + ((asset.deployments as unknown[]) ?? []).length, 0);

export const importCounts = (input: CountInputs) => {
  const { exports, registry, unmapped } = input;
  const fates = exports.markets.map((row) => [rowFate(row), (row.Delisted ?? '').toUpperCase() === 'TRUE'] as const);
  const population = (fate: string, delisted: boolean | null) =>
    fates.filter(([f, d]) => f === fate && (delisted == null || d === delisted)).length;
  const holderItems = exports.markets
    .filter((row) => rowFate(row) === 'asset')
    .reduce((sum, row) => sum + listOf(row['*Holders to be Removed for Active Marketcap']).length, 0);
  const assets = [...input.files].filter(([path]) => ASSET_FILE.test(path)).map(([, file]) => file as FileJson);
  const live = assets.filter((asset) => !isDelisted(asset));
  const populations = {
    'live asset rows': population('asset', false),
    'delisted asset rows': population('asset', true),
    'platform-shaped rows': population('platform-shaped', null),
    'blank rows': population('blank', null),
    'live perps rows': population('perps', false),
    'delisted perps rows': population('perps', true),
    'platforms rows': input.platformsRead,
  };
  const counts = {
    liveAssetRows: population('asset', false),
    perpsRows: population('perps', null),
    mergedPerpsRows: input.perpsUnmapped.filter((row) => row.column === MARKET_ID && row.reason.startsWith('duplicate'))
      .length,
    notImported: population('blank', null) + population('platform-shaped', null),
    heldRows: input.heldRows,
    holderItems,
    ...Object.fromEntries(Object.entries(input.vocabularyValues).map(([name, n]) => [`vocabulary:${name}`, n])),
    liveAssets: live.length,
    delistedAssets: assets.length - live.length,
    assets: assets.length,
    liveDeployments: deploymentsOf(live),
    delistedDeployments: deploymentsOf(assets.filter(isDelisted)),
    markets: registry.perp_market.length,
    venues: registry.venue.length,
    underlyings: registry.underlying.length,
    organizations: registry.organization.length,
    malformedContracts: unmapped.filter((row) => row.column === 'Contracts').length,
    holderItemsListed: unmapped.filter((row) => row.column.startsWith('*Holders')).length,
  };
  return { populations, counts };
};
