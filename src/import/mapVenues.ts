/**
 * mapVenues: one venue per Canonical Market ID prefix, with its fees, oracle and conventions, and the HIP-3 dexes under a hyperliquid venue.
 * @dev review: src/import/mapPerps.ts
 */
import { rwaSlug } from '../registry';
import { groupBy } from '../utils/groupBy';
import { modal } from '../utils/modal';
import type { ImportContext } from './importContext';
import { BATCH, MARKET_ID, type Exports, type FileJson, type Unmapped } from './importTypes';
import { compact, delistingEvent } from './mapOrganizations';
import { numberOf, valueOf, type ExportRow } from './readExport';

export type Fee = { makerFeeBps: number; takerFeeBps: number };

// A venue whose prefix differs from its adapter id; a HIP-3 dex runs on the hyperliquid adapter.
const ADAPTER_OF: Record<string, string> = { 'ondo-perps': 'ondoperps', snx: 'synthetix' };
const UNPUBLISHED = new Set(['lbank', 'bitunix', 'avantis']);
// The venue adapters the server ran when the import was written (defi/src/rwa/adapters/venues); a venue the server cannot read gets none.
const SERVER_VENUE_ADAPTERS = new Set([
  'apex',
  'arcus',
  'aster',
  'binance',
  'bingx',
  'bitget',
  'bybit',
  'coinbase-intx',
  'coinex',
  'cryptocom',
  'delta-india',
  'deribit',
  'edgex',
  'extended',
  'gate',
  'gmtrade',
  'gtrade',
  'helix',
  'hibachi',
  'htx',
  'hyperliquid',
  'kraken',
  'kucoin',
  'lighter',
  'mexc',
  'okx',
  'ondoperps',
  'ostium',
  'paradex',
  'parcl',
  'phemex',
  'qfex',
  'risex',
  'synthetix',
  'variational',
  'whitebit',
]);
export const HYPERLIQUID = 'hyperliquid';
const NOTE_COLUMNS = ['*Fees Protocol', '*Fees Maker/Taker', '*Funding Rates', '*Volume', '*24hr Price Change'];
// The market columns the server published as written; the venue keeps the value most of its markets carry.
export const MARKET_TEXT: [column: string, field: 'website' | 'issuer' | 'marginAsset'][] = [
  ['Website', 'website'],
  ['Issuer', 'issuer'],
  ['Margin / Settlement Asset', 'marginAsset'],
];

const bps = (percent: string) => Math.round(Number(percent) * 100 * 1e6) / 1e6;

export const parseFee = (cell: string | undefined): Fee | null => {
  const value = valueOf(cell) ?? '';
  const words = /^maker\s*(-?[\d.]+)\s*%\s*\/\s*taker\s*(-?[\d.]+)\s*%/i.exec(value);
  if (words) return { makerFeeBps: bps(words[1]), takerFeeBps: bps(words[2]) };
  const points = /^(-?[\d.]+)\s*\/\s*(-?[\d.]+)\s*bps/i.exec(value);
  return points ? { makerFeeBps: Number(points[1]), takerFeeBps: Number(points[2]) } : null;
};

export const feeKey = (fee: Partial<Fee> | null) => (fee ? `${fee.makerFeeBps}/${fee.takerFeeBps}` : null);

const feeOfKey = (key: string | null): Fee | null => {
  if (!key) return null;
  const [maker, taker] = key.split('/').map(Number);
  return { makerFeeBps: maker, takerFeeBps: taker };
};

export const isLive = (row: ExportRow) => (row.Delisted ?? '').toUpperCase() !== 'TRUE';
export const prefixOf = (row: ExportRow) => row[MARKET_ID].slice(0, row[MARKET_ID].indexOf(':'));
const values = (rows: ExportRow[], column: string) => rows.map((row) => valueOf(row[column])).filter((v) => v != null);

const conventionNote = (rows: ExportRow[]): string | null => {
  const notes = NOTE_COLUMNS.flatMap((column) => {
    const text = modal(values(rows, column).filter((value) => numberOf(value) == null && !parseFee(value)));
    return text ? [`${column.replace('*', '')}: ${text}`] : [];
  });
  return notes.length ? notes.join('; ') : null;
};

const platformFee = (platform: ExportRow | undefined): Fee | null => {
  const [maker, taker] = ['Perp Maker Fee (bps)', 'Perp Taker Fee (bps)'].map((column) => numberOf(platform?.[column]));
  return maker != null && taker != null ? { makerFeeBps: maker, takerFeeBps: taker } : null;
};

export const mapVenues = (exports: Exports, context: ImportContext, rows: ExportRow[], unmapped: Unmapped[]) => {
  const { slugOf, organizations, chains } = context;
  const platformRows = new Map(exports.platforms.map((row) => [rwaSlug(row.Name), row]));

  const venueOf = (slug: string, own: ExportRow[], organization: string | null, parent: string | null): FileJson => {
    const platform = organization ? platformRows.get(organization) : undefined;
    const primary = (modal(values(own, 'Primary Chain')) ?? (slug === HYPERLIQUID ? HYPERLIQUID : '')).toLowerCase();
    const chain = primary && primary !== 'cex' ? chains.use(primary) : null;
    const fee =
      platformFee(platform) ??
      feeOfKey(modal(own.map((row) => feeKey(parseFee(row['*Fees Maker/Taker']))).filter((key) => key != null)));
    const id = ADAPTER_OF[slug] ?? (parent ? HYPERLIQUID : slug);
    const adapter = SERVER_VENUE_ADAPTERS.has(id) ? id : null;
    if (!adapter)
      unmapped.push({ id: slug, column: MARKET_ID, value: slug, reason: 'venue with no adapter', batch: BATCH.call });
    return compact({
      slug,
      organization,
      parent,
      venueType: primary === 'cex' ? 'cex' : 'dex',
      chain: chain && 'slug' in chain ? chain.slug : null,
      adapter,
      published: adapter !== null && !UNPUBLISHED.has(slug),
      ...fee,
      fundingRetentionPct: numberOf(platform?.['Perp Funding Retention (%)']),
      oracleProvider: modal(values(own, 'Oracle Provider')),
      accessModel: slugOf('access-model', modal(values(own, 'Access Model')) ?? valueOf(platform?.['Access Model'])),
      rwaClassification: slugOf('rwa-classification', modal(values(own, 'RWA Classification'))),
      conventionNote: conventionNote(own),
      ...Object.fromEntries(MARKET_TEXT.map(([column, field]) => [field, modal(values(own, column))])),
      events: own.length && !own.some(isLive) ? [delistingEvent()] : [],
    });
  };

  const venues = new Map<string, FileJson>();
  for (const [prefix, own] of groupBy(rows, prefixOf)) {
    const parent = (modal(values(own, 'Primary Chain')) ?? '').toLowerCase() === HYPERLIQUID ? HYPERLIQUID : null;
    venues.set(prefix, venueOf(prefix, own, organizations.platformOf(modal(values(own, 'Parent Platform'))), parent));
  }
  const children = [...venues.values()].filter((venue) => venue.parent === HYPERLIQUID);
  const hyperliquid = organizations.platformOf('Hyperliquid');
  if (children.length && !hyperliquid) {
    children.forEach((venue) => delete venue.parent);
    unmapped.push({
      id: HYPERLIQUID,
      column: 'Parent Platform',
      value: 'Hyperliquid',
      reason: 'no Platforms row for the HIP-3 parent venue',
      batch: BATCH.organizations,
    });
  } else if (children.length && !venues.has(HYPERLIQUID)) {
    const own = rows.filter((row) => venues.get(prefixOf(row))?.parent === HYPERLIQUID);
    const { oracleProvider, conventionNote, website, issuer, marginAsset, ...parentVenue } = venueOf(
      HYPERLIQUID,
      own,
      hyperliquid,
      null,
    );
    venues.set(HYPERLIQUID, parentVenue);
  }
  return new Map([...venues].sort(([a], [b]) => a.localeCompare(b)));
};
