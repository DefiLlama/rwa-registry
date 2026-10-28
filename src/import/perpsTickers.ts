/**
 * perpsTickers: the perps rows whose own Reference Ticker differs from the ticker the registry publishes for them, one calls.md line per underlying.
 * @dev review: src/import/mapUnderlyings.ts
 */
import type { Registry } from '../schema';
import { groupBy } from '../utils/groupBy';
import { MARKET_ID, RWA_ID, type Call } from './importTypes';
import { valueOf, type ExportRow } from './readExport';
import { rowFate } from './rowFate';

// A market publishes the ticker of the underlying it tracks, or of the tracked asset's underlying, so one ticker per underlying replaces the row's own.
export const perpsTickerCalls = (markets: ExportRow[], registry: Registry): Call[] => {
  const tickers = new Map(registry.underlying.map((row) => [row.slug, row.ticker ?? null]));
  const underlyingOf = new Map(registry.asset.map((row) => [row.slug, row.underlying ?? null]));
  const byKey = new Map(registry.perp_market.map((row) => [`${row.venue}:${row.symbol}`, row]));
  const replaced = markets
    .filter((row) => rowFate(row) === 'perps')
    .flatMap((row) => {
      const market = byKey.get(row[MARKET_ID]);
      const slug = market?.tracks ?? (market?.tracksAsset ? underlyingOf.get(market.tracksAsset) : null) ?? null;
      const published = slug ? (tickers.get(slug) ?? null) : null;
      const own = valueOf(row['Reference Ticker']);
      return own == null || own === published ? [] : [{ slug: slug ?? 'no underlying', published, row, own }];
    });
  return [...groupBy(replaced, (item) => item.slug)]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, items]) => ({
      topic: `perps reference tickers replaced by the underlying's (${replaced.length} rows)`,
      line: `${slug} publishes ${items[0].published ?? 'no ticker'}: ${items.map(({ row, own }) => `${row[RWA_ID]} ${row[MARKET_ID]} (${own})`).join(', ')}`,
    }));
};
