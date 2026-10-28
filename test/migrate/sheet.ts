/**
 * sheet: a five-row markets export and its Platforms export as csv files in a temp folder, with an empty registry beside them.
 * @dev review: test/migrate/migrateStage.test.ts
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MARKETS_COLUMNS, PLATFORMS_COLUMNS } from '../../src/import/exportColumns';
import type { ExportRow } from '../../src/import/readExport';
import { toCsv } from '../../src/utils/toCsv';
import { assetRow, perpsRow, platformRow, tradeXyzRow } from '../fixtures/import/rows';

// The header holds every column the import reads; the cells a row leaves out read empty.
const csv = (path: string, rows: ExportRow[], read: readonly string[]) => {
  const columns = [...new Set([...read, ...rows.flatMap((row) => Object.keys(row))])];
  writeFileSync(path, toCsv(columns, rows));
  return path;
};

// TSLAx with its ISIN, NVDAx, a wrapper-free third xStock, and two trade[XYZ] markets.
export const fiveRows = (): ExportRow[] => [
  assetRow({ ISIN: 'CH1436219252' }),
  assetRow({
    '*RWA ID': '258',
    Ticker: 'NVDAx',
    Name: 'NVIDIA xStock',
    'Canonical Market ID': 'NVDAx',
    Contracts: 'solana:Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh',
    Chain: 'solana',
    'Reference Asset': 'NVIDIA Corporation',
    'Reference Ticker': 'NVDA',
  }),
  assetRow({
    '*RWA ID': '259',
    Ticker: 'AAPLx',
    Name: 'Apple xStock',
    'Canonical Market ID': 'AAPLx',
    Contracts: 'solana:XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp',
    Chain: 'solana',
    'Reference Asset': 'Apple Inc.',
    'Reference Ticker': 'AAPL',
  }),
  perpsRow(),
  perpsRow({
    '*RWA ID': '2922',
    Ticker: 'NVDA',
    Name: 'NVIDIA Perp',
    'Canonical Market ID': 'xyz:NVDA',
    'Reference Asset': 'NVIDIA Corporation',
    'Reference Ticker': 'NVDA',
  }),
];

export const sheet = (markets: ExportRow[] = fiveRows()) => {
  const dir = mkdtempSync(join(tmpdir(), 'rwa-migrate-'));
  const root = join(dir, 'registry');
  mkdirSync(root);
  return {
    dir,
    root,
    out: join(dir, 'out'),
    markets: csv(join(dir, 'markets.csv'), markets, MARKETS_COLUMNS),
    platforms: csv(join(dir, 'platforms.csv'), [platformRow(), tradeXyzRow()], PLATFORMS_COLUMNS),
  };
};
