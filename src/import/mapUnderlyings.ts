/**
 * mapUnderlyings: one underlying per distinct Reference Asset spelling, with the spelling's most common ticker, its class and its ISIN.
 * @dev review: src/import/mapAssets.ts
 */
import { rowSlug, rwaSlug } from '../registry';
import { homeOf } from '../registry/layout';
import { groupBy } from '../utils/groupBy';
import { modal } from '../utils/modal';
import { BATCH, RWA_ID, type FileJson, type RegistryFiles, type Unmapped } from './importTypes';
import { isinCodes, sheetIsin } from './isin';
import { listOf, valueOf, type ExportRow } from './readExport';
import { rowFate } from './rowFate';

const CLASS_OF_GROUP: Record<string, string> = {
  'Public Equities': 'equity',
  'Equity ETFs': 'equity',
  'Equity Indices': 'equity',
  'Private Equity & Venture': 'equity',
  'AI & Compute Infrastructure': 'equity',
  'Precious Metals': 'commodity',
  Oil: 'commodity',
  'Industrial Metals': 'commodity',
  'Natural Gas': 'commodity',
  'Agricultural Commodities': 'commodity',
  'Commodity Baskets': 'commodity',
  Energy: 'commodity',
  'Fiat Currencies': 'fx',
  'Crypto / Digital Assets': 'crypto',
  'RWA Infrastructure': 'crypto',
  Bonds: 'rate',
  'Private Credit': 'rate',
  'Mixed Public Markets': 'fund',
  'Multi-Asset RWAs': 'fund',
  'Mixed Public & Private Markets': 'fund',
  'Private Markets': 'fund',
};

export const mapUnderlyings = (rows: ExportRow[]) => {
  const unmapped: Unmapped[] = [];
  const named = rows.filter((row) => valueOf(row['Reference Asset']) != null);
  const bySpelling = groupBy(named, (row) => valueOf(row['Reference Asset'])!);
  const firstId = (spelling: string) => Math.min(...bySpelling.get(spelling)!.map((row) => Number(row[RWA_ID])));
  const claimed = new Map<string, string>();
  const taken = new Set<string>();
  // A Reference Asset can be a sentence; its slug keeps the first 80 characters so the file name stays short.
  const short = (spelling: string) => rowSlug(spelling).slice(0, 80).replace(/-+$/, '');
  for (const spelling of [...bySpelling.keys()].sort((a, b) => firstId(a) - firstId(b))) {
    const slug = taken.has(short(spelling)) ? `${short(spelling)}-${firstId(spelling)}` : short(spelling);
    claimed.set(spelling, slug);
    taken.add(slug);
  }

  const underlyings = new Map<string, FileJson>();
  const currencies = new Set<string>();
  const isinHolders = new Map<string, string>();
  for (const [spelling, own] of bySpelling) {
    const slug = claimed.get(spelling)!;
    const ticker = modal(own.map((row) => valueOf(row['Reference Ticker'])).filter((value) => value != null));
    const group = modal(own.map((row) => valueOf(row['Asset Group'])).filter((value) => value != null));
    const fx = /^([A-Z]{3})\.FX$/.exec(ticker ?? '');
    const kind = (group && CLASS_OF_GROUP[group]) ?? 'other';
    if (fx && kind === 'fx') currencies.add(fx[1]);
    const identifiers = [];
    for (const row of own) {
      for (const item of listOf(row.ISIN).filter((item) => /underlying/i.test(item))) {
        for (const code of isinCodes(item)) {
          const holder = isinHolders.get(code);
          if (holder === slug) continue;
          if (holder) {
            unmapped.push({
              id: row[RWA_ID],
              column: 'ISIN',
              value: code,
              reason: `identifier held by another row: underlying ${holder}`,
              batch: BATCH.underlyings,
            });
            continue;
          }
          isinHolders.set(code, slug);
          identifiers.push(sheetIsin(code));
        }
      }
    }
    underlyings.set(slug, {
      slug,
      name: spelling,
      ...(ticker ? { ticker } : {}),
      class: kind,
      ...(group ? { exposure: rwaSlug(group) } : {}),
      ...(identifiers.length ? { identifiers } : {}),
      ...(fx && kind === 'fx' ? { currency: fx[1].toLowerCase() } : {}),
    });
  }
  const sorted = new Map([...underlyings].sort(([a], [b]) => a.localeCompare(b)));
  const perpsOnly = new Set(
    [...bySpelling]
      .filter(([, own]) => own.every((row) => rowFate(row) === 'perps'))
      .map(([spelling]) => claimed.get(spelling)!),
  );
  return {
    underlyings: sorted,
    perpsOnly,
    slugOf: (spelling: string | null) => (spelling ? (claimed.get(spelling) ?? null) : null),
    currencies: [...currencies].sort(),
    unmapped,
  };
};

// A spelling only perps rows give, whose markets all track a token once patched (Pax Gold, Tether Gold), names nothing, so it gets no file.
export const withoutUntracked = (files: RegistryFiles, perpsOnly: Set<string>): RegistryFiles => {
  const tracked = new Set(
    [...files].filter(([path]) => homeOf(path)?.table === 'perp_market').map(([, json]) => (json as FileJson).tracks),
  );
  const kept = (path: string) => {
    const slug = /^reference\/underlyings\/([^/]+)\.json$/.exec(path)?.[1];
    return !slug || !perpsOnly.has(slug) || tracked.has(slug);
  };
  return new Map([...files].filter(([path]) => kept(path)));
};
