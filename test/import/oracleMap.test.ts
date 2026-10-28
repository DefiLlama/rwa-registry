import { describe, expect, it } from 'vitest';
import type { PatchRow } from '../../src/import/applyPatch';
import type { FileJson, RegistryFiles } from '../../src/import/importTypes';
import { applyOracleMap, readOracleMap } from '../../src/import/oracleMap';
import { assetRow, perpsRow, platformRow } from '../fixtures/import/rows';

const patch = (file: string, path: string, old: string, next: unknown, source = 'https://chain.link/'): PatchRow => ({
  file,
  path,
  old,
  new: typeof next === 'string' ? next : JSON.stringify(next),
  source,
  fetchedAt: '2026-10-25',
  agent: 'opus',
  verified: '',
});
const mapRow = (cell: string, next: unknown) => patch('export:oracle-map', 'Oracle Provider', cell, next);
const firm = (slug: string, name: string, kind: string, website: string | null) =>
  patch('export:oracle-firm', slug, '', { slug, name, kind, website });

const PROOF = 'Chainlink Proof of Reserve + The Network Firm';
const rows = [
  firm('chainlink', 'Chainlink', 'brand', 'https://chain.link/'),
  firm('the-network-firm', 'The Network Firm', 'entity', 'https://www.thenetworkfirm.com/'),
  firm('pyth-network', 'Pyth Network', 'brand', 'https://pyth.network/'),
  firm('xstocks', 'xStocks', 'brand', null),
  mapRow(PROOF, { kind: 'oracle', organization: 'chainlink', note: 'Proof of Reserve' }),
  mapRow(PROOF, { kind: 'auditor', organization: 'the-network-firm', note: null }),
  mapRow('Issuer-published NAV', { kind: 'oracle', organization: '@issuer', note: null }),
  mapRow('N/A (issuance platform)', { kind: null, organization: null, note: 'no oracle' }),
  mapRow('GMCI methodology', 'unknown'),
  mapRow('Chainlink + GramChain', { kind: 'oracle', organization: 'chainlink', note: null }),
  mapRow('Chainlink + GramChain', { kind: null, organization: 'gramchain', note: 'role unknown' }),
  mapRow('Pyth Lazer', { kind: 'oracle', organization: 'pyth-network', note: null }),
];

const ISSUER = { organization: 'backed-assets-je-limited', kind: 'issuer' };
const filesOf = (): RegistryFiles =>
  new Map<string, FileJson>([
    ['assets/xstocks/platform.json', { slug: 'xstocks', name: 'xStocks', kind: 'platform', legacyPid: 12 }],
    ['assets/xstocks/tslax.json', { slug: 'tslax', legacyId: 257, roles: [ISSUER] }],
    ['assets/xstocks/nvdax.json', { slug: 'nvdax', legacyId: 258, roles: [ISSUER] }],
    ['assets/xstocks/aaplx.json', { slug: 'aaplx', legacyId: 259, roles: [ISSUER] }],
    ['assets/xstocks/msftx.json', { slug: 'msftx', legacyId: 260, roles: [ISSUER] }],
    ['assets/xstocks/coinx.json', { slug: 'coinx', legacyId: 261, roles: [ISSUER] }],
    ['reference/organizations/backed-assets-je-limited.json', { slug: 'backed-assets-je-limited' }],
    ['perps/xyz/venue.json', { slug: 'xyz', oracleProvider: 'Pyth Lazer' }],
  ]);
const exportsOf = () => ({
  markets: [
    assetRow({ 'Oracle Provider': PROOF }),
    assetRow({ '*RWA ID': '258', 'Oracle Provider': 'Issuer-published NAV' }),
    assetRow({ '*RWA ID': '259', 'Oracle Provider': 'N/A (issuance platform)' }),
    assetRow({ '*RWA ID': '260', 'Oracle Provider': 'GMCI methodology' }),
    assetRow({ '*RWA ID': '261', 'Oracle Provider': 'Chainlink + GramChain' }),
    perpsRow({ 'Oracle Provider': 'Pyth Lazer' }),
  ],
  platforms: [platformRow({ 'Oracle Provider': 'Issuer-published NAV', Issuer: 'Backed Assets (JE) Limited' })],
});

describe('oracleMap', () => {
  it('writes an oracle firm as an organization unless the slug exists', () => {
    const { files } = applyOracleMap(filesOf(), exportsOf(), readOracleMap(rows));

    expect(files.get('reference/organizations/chainlink.json')).toEqual({
      slug: 'chainlink',
      name: 'Chainlink',
      kind: 'brand',
      links: { website: ['https://chain.link/'] },
    });
    expect(files.get('reference/organizations/the-network-firm.json')).toMatchObject({ kind: 'entity' });
    expect(files.has('reference/organizations/xstocks.json')).toBe(false);
  });

  it('turns a mapped spot cell into roles after the issuer roles, @issuer naming the first issuer', () => {
    const { files } = applyOracleMap(filesOf(), exportsOf(), readOracleMap(rows));

    expect((files.get('assets/xstocks/tslax.json') as FileJson).roles).toEqual([
      ISSUER,
      { organization: 'chainlink', kind: 'oracle' },
      { organization: 'the-network-firm', kind: 'auditor' },
    ]);
    expect((files.get('assets/xstocks/nvdax.json') as FileJson).roles).toEqual([
      ISSUER,
      { organization: 'backed-assets-je-limited', kind: 'oracle' },
    ]);
    expect((files.get('assets/xstocks/platform.json') as FileJson).roles).toEqual([
      { organization: 'xstocks', kind: 'oracle' },
    ]);
  });

  it('writes nothing for a no-oracle cell and lists an unknown cell and a role with no kind', () => {
    const { files, unmapped } = applyOracleMap(filesOf(), exportsOf(), readOracleMap(rows));

    expect((files.get('assets/xstocks/aaplx.json') as FileJson).roles).toEqual([ISSUER]);
    expect((files.get('assets/xstocks/msftx.json') as FileJson).roles).toEqual([ISSUER]);
    expect((files.get('assets/xstocks/coinx.json') as FileJson).roles).toEqual([
      ISSUER,
      { organization: 'chainlink', kind: 'oracle' },
    ]);
    expect(unmapped.map((row) => [row.id, row.reason])).toEqual([
      ['260', 'oracle map: unknown'],
      ['261', 'oracle map: role of gramchain has no kind'],
    ]);
  });

  it('keeps the perps oracle text and adds the venue role; a cell with no map row stays listed', () => {
    const { files, unmapped } = applyOracleMap(filesOf(), exportsOf(), readOracleMap([]));
    const mapped = applyOracleMap(filesOf(), exportsOf(), readOracleMap(rows)).files;

    expect(mapped.get('perps/xyz/venue.json')).toEqual({
      slug: 'xyz',
      oracleProvider: 'Pyth Lazer',
      roles: [{ organization: 'pyth-network', kind: 'oracle' }],
    });
    expect(files).toEqual(filesOf());
    expect(unmapped.filter((row) => row.reason === 'oracle cells wait for the oracle map')).toHaveLength(6);
  });

  it("writes a Platforms row's Oracle Proof Link on its oracle roles and lists one with no role", () => {
    const link = 'https://data.chain.link/feeds/ethereum/mainnet/buidl-por';
    const exports = {
      ...exportsOf(),
      platforms: [
        platformRow({ 'Oracle Provider': PROOF, 'Oracle Proof Link': link }),
        platformRow({ '*PID': '273', Name: 'Brale', 'Oracle Provider': 'GMCI methodology', 'Oracle Proof Link': link }),
      ],
    };
    const withBrale = new Map(filesOf()).set('assets/brale/platform.json', { slug: 'brale', legacyPid: 273 });
    const { files, unmapped } = applyOracleMap(withBrale, exports, readOracleMap(rows));

    expect((files.get('assets/xstocks/platform.json') as FileJson).roles).toEqual([
      { organization: 'chainlink', kind: 'oracle', sourceLinks: [link] },
      { organization: 'the-network-firm', kind: 'auditor', sourceLinks: [link] },
    ]);
    expect((files.get('assets/xstocks/tslax.json') as FileJson).roles).not.toContainEqual(
      expect.objectContaining({ sourceLinks: [link] }),
    );
    expect(unmapped).toContainEqual(
      expect.objectContaining({ id: 'PID 273', reason: 'a proof link with no oracle role' }),
    );
  });

  it("writes an asset's Oracle Proof Link URLs on its oracle roles, skips a provider name and lists a URL with no role", () => {
    const link = 'https://data.chain.link/feeds/ethereum/mainnet/tslax-por';
    const exports = {
      ...exportsOf(),
      markets: [
        assetRow({ 'Oracle Provider': PROOF, 'Oracle Proof Link': `Chainlink; ${link}` }),
        assetRow({ '*RWA ID': '259', 'Oracle Provider': 'N/A (issuance platform)', 'Oracle Proof Link': link }),
        assetRow({ '*RWA ID': '261', 'Oracle Provider': 'Chainlink + GramChain', 'Oracle Proof Link': 'Chainlink' }),
      ],
    };
    const { files, unmapped } = applyOracleMap(filesOf(), exports, readOracleMap(rows));

    expect((files.get('assets/xstocks/tslax.json') as FileJson).roles).toEqual([
      ISSUER,
      { organization: 'chainlink', kind: 'oracle', sourceLinks: [link] },
      { organization: 'the-network-firm', kind: 'auditor', sourceLinks: [link] },
    ]);
    expect((files.get('assets/xstocks/coinx.json') as FileJson).roles).toEqual([
      ISSUER,
      { organization: 'chainlink', kind: 'oracle' },
    ]);
    expect(unmapped).toContainEqual(expect.objectContaining({ id: '259', reason: 'a proof link with no oracle role' }));
  });
});
