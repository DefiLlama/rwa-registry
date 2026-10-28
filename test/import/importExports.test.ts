import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARKETS_COLUMNS, PLATFORMS_COLUMNS } from '../../src/import/exportColumns';
import { importExports } from '../../src/import/importExports';
import type { ExportRow } from '../../src/import/readExport';
import { toCsv } from '../../src/utils/toCsv';
import { assetRow, perpsRow, platformRow } from '../fixtures/import/rows';
import { errorsIn } from '../fixtures/tree';

// The header holds every column the import reads, the cells a fixture leaves out read empty.
const csv = (dir: string, name: string, rows: ExportRow[], read: readonly string[]) => {
  const columns = [...new Set([...read, ...rows.flatMap((row) => Object.keys(row))])];
  writeFileSync(join(dir, name), toCsv(columns, rows));
  return join(dir, name);
};

const setupRows = (markets: ExportRow[]) => {
  const dir = mkdtempSync(join(tmpdir(), 'rwa-import-'));
  return {
    markets: csv(dir, 'markets.csv', markets, MARKETS_COLUMNS),
    platforms: csv(dir, 'platforms.csv', [platformRow()], PLATFORMS_COLUMNS),
    root: join(dir, 'registry'),
    out: join(dir, 'out'),
  };
};

const setup = (cells: ExportRow = {}, perpsCells: ExportRow = {}) => setupRows([assetRow(cells), perpsRow(perpsCells)]);

const read = (root: string, file: string) => JSON.parse(readFileSync(join(root, file), 'utf8'));

// A second TSLAx-like row of the same underlying, on its own id and address.
const twin = (id: string, cells: ExportRow = {}) =>
  assetRow({
    '*RWA ID': id,
    Ticker: `TSLA${id}`,
    'Canonical Market ID': `TSLA${id}`,
    Contracts: `ethereum:0x${id.padStart(40, '0')}`,
    'Primary Chain': 'ethereum',
    ...cells,
  });

const files = (root: string): string[] =>
  readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1))
    .sort();

describe('importExports', () => {
  it('imports a two-row markets export and a one-row platforms export', () => {
    const paths = setup();

    const report = importExports(paths);

    expect(files(paths.root).filter((file) => !file.startsWith('reference/vocabularies/'))).toEqual([
      'assets/xstocks/platform.json',
      'assets/xstocks/tslax.json',
      'perps/xyz/organization.json',
      'perps/xyz/tsla.json',
      'perps/xyz/venue.json',
      'reference/chains/ethereum.json',
      'reference/chains/gravity.json',
      'reference/chains/hyperliquid.json',
      'reference/chains/imx.json',
      'reference/chains/iotaevm.json',
      'reference/chains/occ.json',
      'reference/chains/solana.json',
      'reference/organizations/issuer/backed-assets-je-limited.json',
      'reference/underlyings/equity/tesla-inc.json',
    ]);
    expect(['report.md', 'unmapped.csv', 'calls.md'].map((name) => existsSync(join(paths.out, name)))).toEqual([
      true,
      true,
      true,
    ]);
    expect(readFileSync(join(paths.out, 'unmapped.csv'), 'utf8')).toContain('2921,Margin / Settlement Asset,USDC');
    expect(errorsIn(report.problems)).toEqual([]);
  });

  it('writes a row for each chain the stablecoins feed names, with the display name and sdk key the server reads', () => {
    const paths = setup();

    importExports(paths);

    expect(
      ['gravity', 'imx', 'iotaevm', 'occ'].map((slug) => read(paths.root, `reference/chains/${slug}.json`)),
    ).toEqual(
      [
        ['gravity', 'Gravity by Galxe'],
        ['imx', 'Immutable zkEVM'],
        ['iotaevm', 'IOTA EVM'],
        ['occ', 'EDU Chain'],
      ].map(([slug, label]) => expect.objectContaining({ slug, label, addressFamily: 'evm', sdkKey: slug })),
    );
  });

  it('a second run changes no file', () => {
    const paths = setup();
    importExports(paths);
    const before = files(paths.root).map((file) => readFileSync(join(paths.root, file), 'utf8'));

    const second = importExports(paths);

    expect(second.written).toBe(0);
    expect(files(paths.root).map((file) => readFileSync(join(paths.root, file), 'utf8'))).toEqual(before);
  });

  it('reads the oracle rows of a patch folder', () => {
    const paths = setup({ 'Oracle Provider': 'Chainlink' });
    const patches = join(paths.out, '..', 'batches');
    mkdirSync(patches, { recursive: true });
    writeFileSync(
      join(patches, '07.csv'),
      [
        'file,path,old,new,source,fetchedAt,agent,verified',
        'export:oracle-firm,chainlink,,"{""slug"":""chainlink"",""name"":""Chainlink"",""kind"":""brand"",""website"":""https://chain.link/""}",https://chain.link/,2026-10-25,opus,',
        'export:oracle-map,Oracle Provider,Chainlink,"{""kind"":""oracle"",""organization"":""chainlink"",""note"":null}",https://chain.link/,2026-10-25,opus,',
      ].join('\n'),
    );
    const report = importExports({ ...paths, patches });

    const asset = JSON.parse(readFileSync(join(paths.root, 'assets/xstocks/tslax.json'), 'utf8'));
    expect(asset.roles).toContainEqual({ organization: 'chainlink', kind: 'oracle' });
    expect(existsSync(join(paths.root, 'reference/organizations/oracle/chainlink.json'))).toBe(true);
    expect(readFileSync(join(paths.out, 'unmapped.csv'), 'utf8')).not.toContain('oracle cells wait');
    expect(errorsIn(report.problems)).toEqual([]);
  });

  it('folds a decided spelling into the slug it keeps and writes the underlying in its class folder', () => {
    const paths = setup({}, { 'Reference Asset': 'Tesla Inc' });
    mkdirSync(join(paths.out, 'held'), { recursive: true });
    writeFileSync(
      join(paths.out, 'held', 'underlying-folds.csv'),
      'file,path,old,new,source,fetchedAt,agent,verified,decision,target\n' +
        'reference/underlyings/tesla-inc-2921.json,fold,Tesla Inc,tesla-inc,rule,,import pass 0,,confirmed,tesla-inc\n',
    );

    const report = importExports(paths);

    expect(files(paths.root).filter((file) => file.startsWith('reference/underlyings/'))).toEqual([
      'reference/underlyings/equity/tesla-inc.json',
    ]);
    expect(JSON.parse(readFileSync(join(paths.root, 'reference/underlyings/equity/tesla-inc.json'), 'utf8'))).toEqual({
      slug: 'tesla-inc',
      name: 'Tesla, Inc.',
      aliases: ['Tesla Inc'],
      ticker: 'TSLA',
      exposure: 'public-equities',
    });
    expect(JSON.parse(readFileSync(join(paths.root, 'perps/xyz/tsla.json'), 'utf8')).tracks.underlying).toBe(
      'tesla-inc',
    );
    expect(errorsIn(report.problems)).toEqual([]);
  });

  it('writes the primary chain as a flag on its deployment and the protocol ids on the issuer role', () => {
    const paths = setup({ '*projectID': '6378' });

    importExports(paths);

    const asset = read(paths.root, 'assets/xstocks/tslax.json');
    expect(
      asset.deployments.map((row: { chain: string; primary?: boolean }) => [row.chain, row.primary ?? null]),
    ).toEqual([
      ['solana', true],
      ['ethereum', null],
    ]);
    expect(asset.roles).toEqual([
      expect.objectContaining({ organization: 'backed-assets-je-limited', kind: 'issuer', protocolIds: [6378] }),
    ]);
  });

  it("puts the rows' asset group on their underlying, keeps the most common one, and lists the rows that lose", () => {
    const paths = setupRows([assetRow(), twin('258', { 'Asset Group': 'Equity ETFs' }), perpsRow()]);

    importExports(paths);

    expect(read(paths.root, 'reference/underlyings/equity/tesla-inc.json').exposure).toBe('public-equities');
    expect(read(paths.root, 'assets/xstocks/tsla258.json').exposure).toEqual({ underlying: 'tesla-inc' });
    const calls = readFileSync(join(paths.out, 'calls.md'), 'utf8');
    expect(calls).toContain('## taxonomy');
    expect(calls).toContain('tesla-inc keeps exposure public-equities (2 rows); equity-etfs on 1 row: 258');
  });

  it('derives the category from one rule per structure and exposure, and lists each row whose sheet category differs', () => {
    const paths = setupRows([
      assetRow(),
      twin('258', { Category: 'Stocks & Equities; Gold & Commodities' }),
      twin('259'),
      perpsRow(),
    ]);

    importExports(paths);

    expect(read(paths.root, 'reference/vocabularies/category-rules.json')).toEqual([
      { structure: 'stock-backed', exposure: 'public-equities', category: ['stocks-equities'] },
    ]);
    expect(read(paths.root, 'assets/xstocks/tsla258.json').class).toEqual({
      structure: 'stock-backed',
      type: 'asset',
      rwaClassification: 'true-rwa',
    });
    const calls = readFileSync(join(paths.out, 'calls.md'), 'utf8');
    expect(calls).toContain('Category: 1 of 3 rows differ from the rule of their structure and exposure');
    expect(calls).toContain(
      '1 row of stock-backed on public-equities: the sheet says stocks-equities, gold-commodities, the rule stocks-equities: 258',
    );
  });

  it('keeps a category rule the file already holds, so a decided rule moves the rows that differ', () => {
    const paths = setupRows([assetRow(), twin('258', { Category: 'Gold & Commodities' }), twin('259'), perpsRow()]);
    importExports(paths);
    const computed = read(paths.root, 'reference/vocabularies/category-rules.json');
    writeFileSync(
      join(paths.root, 'reference/vocabularies/category-rules.json'),
      JSON.stringify([{ structure: 'stock-backed', exposure: 'public-equities', category: ['gold-commodities'] }]),
    );

    importExports(paths);

    expect(computed).toEqual([
      { structure: 'stock-backed', exposure: 'public-equities', category: ['stocks-equities'] },
    ]);
    expect(readFileSync(join(paths.out, 'calls.md'), 'utf8')).toContain(
      '2 rows of stock-backed on public-equities: the sheet says stocks-equities, the rule gold-commodities: 257, 259',
    );
  });
});
