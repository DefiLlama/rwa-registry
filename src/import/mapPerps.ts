/**
 * mapPerps: the venues, then one market file per Canonical Market ID, where a duplicated id merges into the live row and the lowest legacy id.
 * @dev review: src/import/mapVenues.ts
 */
import { marketFile, rowSlug } from '../registry';
import { groupBy } from '../utils/groupBy';
import type { ImportContext } from './importContext';
import { BATCH, MARKET_ID, RWA_ID, type Exports, type FileJson, type Unmapped } from './importTypes';
import { compact, delistingEvent, reviewEvent } from './mapOrganizations';
import { feeKey, isLive, mapVenues, MARKET_TEXT, parseFee, prefixOf } from './mapVenues';
import { listOf, valueOf, type ExportRow } from './readExport';
import { rowFate } from './rowFate';

const idOf = (row: ExportRow) => Number(row[RWA_ID]);

// A token named like the exposure it tracks (AAPLc is "Apple Inc.") is a claim on it, so a perp tracks the exposure.
const tokensNamedBy = (assets: FileJson[], context: ImportContext) => {
  const exposureOf = (asset: FileJson) =>
    rowSlug(String(context.underlyings.underlyings.get(String(asset.underlying))?.name ?? ''));
  const byName = groupBy(assets, (asset) => String(asset.name).toLowerCase());
  return (reference: string): string[] =>
    (byName.get(reference.toLowerCase()) ?? [])
      .filter((asset) => exposureOf(asset) !== rowSlug(reference))
      .map((asset) => String(asset.slug));
};

// The live row of a duplicated id gives the facts, the newer of two live rows, and the lowest legacy id stays.
const pickMerged = (group: ExportRow[]) => {
  const live = group.filter(isLive).sort((a, b) => idOf(b) - idOf(a));
  const row = live[0] ?? [...group].sort((a, b) => idOf(b) - idOf(a))[0];
  return { row, legacyId: Math.min(...group.map(idOf)) };
};

const perpsGroups = (exports: Exports) =>
  groupBy(
    exports.markets.filter((row) => rowFate(row) === 'perps'),
    (row) => row[MARKET_ID],
  );

// A merged market whose kept legacy id is a delisted twin's, while a live row with another id gives the facts.
export const keptDelistedIds = (exports: Exports): { marketId: string; kept: number; live: number }[] =>
  [...perpsGroups(exports)].flatMap(([marketId, group]) => {
    const { row, legacyId } = pickMerged(group);
    const kept = group.find((twin) => idOf(twin) === legacyId)!;
    return isLive(row) && !isLive(kept) ? [{ marketId, kept: legacyId, live: idOf(row) }] : [];
  });

const mergedRow = (group: ExportRow[], unmapped: Unmapped[]) => {
  const { row, legacyId } = pickMerged(group);
  for (const twin of group.filter((other) => other !== row)) {
    const reason = `duplicate market id merged into legacy id ${legacyId}`;
    unmapped.push({ id: twin[RWA_ID], column: MARKET_ID, value: row[MARKET_ID], reason, batch: BATCH.none });
  }
  return { row, legacyId };
};

const listGaps = (row: ExportRow, collateral: string | null, unmapped: Unmapped[]) => {
  const collateralCell = valueOf(row['Margin / Settlement Asset']);
  if (collateralCell && !collateral) {
    const reason = 'names no listed token';
    unmapped.push({
      id: row[RWA_ID],
      column: 'Margin / Settlement Asset',
      value: collateralCell,
      reason,
      batch: BATCH.call,
    });
  }
  if (!parseFee(row['*Fees Maker/Taker']) && valueOf(row['*Fees Maker/Taker'])) {
    const reason = 'fee prose: maker and taker bps need a reading';
    unmapped.push({
      id: row[RWA_ID],
      column: '*Fees Maker/Taker',
      value: row['*Fees Maker/Taker'],
      reason,
      batch: BATCH.venues,
    });
  }
};

export const mapPerps = (exports: Exports, context: ImportContext, assetFiles: Map<string, FileJson>) => {
  const { slugOf, underlyings } = context;
  const unmapped: Unmapped[] = [];
  const rows = exports.markets.filter((row) => rowFate(row) === 'perps');
  const venues = mapVenues(exports, context, rows, unmapped);
  const files = new Map<string, FileJson>([...venues].map(([slug, venue]) => [`perps/${slug}/venue.json`, venue]));
  const assets = [...assetFiles.values()];
  const tokensNamed = tokensNamedBy(assets, context);
  const assetByMarketId = new Map(assets.map((asset) => [String(asset.canonicalMarketId), String(asset.slug)]));
  const markets = perpsGroups(exports);
  const byFirstId = [...markets].sort(([, a], [, b]) => Math.min(...a.map(idOf)) - Math.min(...b.map(idOf)));
  for (const [marketId, group] of byFirstId) {
    const { row, legacyId } = mergedRow(group, unmapped);
    const venue = prefixOf(row);
    const symbol = marketId.slice(venue.length + 1);
    const reference = valueOf(row['Reference Asset']);
    const named = reference ? tokensNamed(reference) : [];
    const collateralCell = valueOf(row['Margin / Settlement Asset']);
    const collateral = collateralCell ? (assetByMarketId.get(collateralCell.replace(/\s*\(.*\)$/, '')) ?? null) : null;
    listGaps(row, collateral, unmapped);
    const fee = parseFee(row['*Fees Maker/Taker']);
    const own = venues.get(venue)!;
    const oracle = valueOf(row['Oracle Provider']);
    files.set(
      marketFile({ venue, symbol }),
      compact({
        venue,
        symbol,
        name: valueOf(row.Name),
        legacyId,
        tracks: named.length === 1 ? null : underlyings.slugOf(reference),
        tracksAsset: named.length === 1 ? named[0] : null,
        assetClass: slugOf('asset-class', listOf(row['Asset Class'])[0] ?? null),
        assetGroup: slugOf('asset-group', valueOf(row['Asset Group'])),
        collateral,
        pair: valueOf(row.Pair),
        ...(fee && feeKey(fee) !== feeKey(own) ? fee : {}),
        oracleProvider: oracle !== own.oracleProvider ? oracle : null,
        description: valueOf(row['Description/Notes']),
        logo: valueOf(row.Logo),
        refLinks: listOf(row['Ref Links']),
        ...Object.fromEntries(
          MARKET_TEXT.map(([column, field]) => {
            const value = valueOf(row[column]);
            return [field, value !== own[field] ? value : null];
          }),
        ),
        events: [
          group.some(isLive) ? null : delistingEvent(),
          reviewEvent(row.Suspicious, row['Suspicious Reason?'], (reason, value) =>
            unmapped.push({ id: row[RWA_ID], column: 'Suspicious Reason?', value, reason, batch: BATCH.rows }),
          ),
        ].filter(Boolean),
      }),
    );
  }
  return { files, unmapped };
};
