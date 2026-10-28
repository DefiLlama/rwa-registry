import { describe, expect, it } from 'vitest';
import { ChainBook } from '../../src/import/chainBook';
import { mapOrganizations } from '../../src/import/mapOrganizations';
import { mapVocabularies } from '../../src/import/mapVocabularies';
import { assetRow, platformRow, tradeXyzRow } from '../fixtures/import/rows';

const organize = (markets = [assetRow()], platforms = [platformRow()]) => {
  const exports = { markets, platforms };
  return mapOrganizations(exports, { slugOf: mapVocabularies(exports, {}, []).slugOf, chains: new ChainBook() });
};

describe('mapOrganizations', () => {
  it('makes one organization of an issuer and a platform that share a slug', () => {
    const { organizations, issuerOf } = organize(
      [assetRow({ Issuer: 'STASIS', 'Parent Platform': 'Stasis' })],
      [platformRow({ Name: 'Stasis' })],
    );

    expect([...organizations.keys()]).toEqual(['stasis']);
    expect(issuerOf('STASIS')).toBe('stasis');
  });

  it('moves a fee text from a number column to revenueNotes and leaves the fee null', () => {
    const { organizations } = organize(
      [assetRow()],
      [platformRow({ 'Mint Fee (bps)': 'Varies per asset', 'Revenue Notes': 'Spread' })],
    );

    expect(organizations.get('xstocks')!.fees).toMatchObject({
      mintFeeBps: null,
      revenueNotes: 'Spread; Mint Fee (bps): Varies per asset',
    });
  });

  it('makes a platform organization of a Parent Platform with no Platforms row', () => {
    const { organizations } = organize([assetRow({ 'Parent Platform': 'OpenStock' })], [platformRow()]);

    expect(organizations.get('openstock')).toMatchObject({ slug: 'openstock', name: 'OpenStock', kind: 'platform' });
  });

  it('writes Parent Platform as parentPlatform by slug, its own slug when it names itself, and parent only for another', () => {
    const { organizations, unmapped } = organize(
      [assetRow()],
      [
        platformRow({ 'Parent Platform': 'xStocks' }),
        platformRow({ '*PID': '181', Name: 'CASH (Bridge)', 'Parent Platform': 'xStocks' }),
        platformRow({ '*PID': '182', Name: 'Lone', 'Parent Platform': '' }),
        platformRow({ '*PID': '123', Name: 'Typo', 'Parent Platform': 'xStock' }),
      ],
    );

    expect(organizations.get('xstocks')).toMatchObject({ parentPlatform: 'xstocks' });
    expect(organizations.get('xstocks')!.parent).toBeUndefined();
    expect(organizations.get('cash-bridge')).toMatchObject({ parentPlatform: 'xstocks', parent: 'xstocks' });
    expect(organizations.get('lone')!.parentPlatform).toBeUndefined();
    expect(organizations.get('typo')!.parentPlatform).toBeUndefined();
    expect(unmapped).toContainEqual(
      expect.objectContaining({
        id: 'PID 123',
        column: 'Parent Platform',
        value: 'xStock',
        reason: 'names no Platforms row',
      }),
    );
  });

  it("leaves a platform's blank Suspicious, Delisted or Llama Grade Attestation out and keeps a FALSE as false", () => {
    const { organizations } = organize(
      [assetRow()],
      [
        platformRow({ Suspicious: 'FALSE', Delisted: 'FALSE', 'Llama Grade Attestation': 'FALSE' }),
        platformRow({ '*PID': '182', Name: 'Blank', Suspicious: '', Delisted: '', 'Llama Grade Attestation': '' }),
      ],
    );

    expect(organizations.get('xstocks')).toMatchObject({
      suspicious: false,
      delisted: false,
      llamaGradeAttestation: false,
    });
    for (const field of ['suspicious', 'delisted', 'llamaGradeAttestation'])
      expect(organizations.get('blank')).not.toHaveProperty(field);
  });

  it('keeps every Website link and writes refLinks from Ref Links only', () => {
    const { organizations } = organize(
      [assetRow()],
      [platformRow({ Website: 'https://xstocks.fi; https://backed.fi', 'Ref Links': 'https://docs.xstocks.fi' })],
    );

    expect(organizations.get('xstocks')!.links).toEqual({
      website: ['https://xstocks.fi', 'https://backed.fi'],
      refLinks: ['https://docs.xstocks.fi'],
    });
  });

  it('writes the Issuer Source Link on each issuer role and lists a link with no issuer', () => {
    const { organizations, unmapped } = organize(
      [assetRow()],
      [
        platformRow({
          Issuer: 'Backed Assets (JE) Limited; Backed Finance AG',
          'Issuer Source Link': 'https://backed.fi ; https://xstocks.fi/legal',
        }),
        platformRow({ '*PID': '265', Name: 'Roofstock onChain', 'Issuer Source Link': 'https://roofstockonchain.com' }),
      ],
    );

    const sourceLinks = ['https://backed.fi', 'https://xstocks.fi/legal'];
    expect(organizations.get('xstocks')!.roles).toEqual([
      { organization: 'backed-assets-je-limited', kind: 'issuer', sourceLinks },
      { organization: 'backed-finance-ag', kind: 'issuer', sourceLinks },
    ]);
    expect(organizations.get('roofstock-onchain')!.roles).toBeUndefined();
    expect(unmapped).toContainEqual(
      expect.objectContaining({ id: 'PID 265', column: 'Issuer Source Link', value: 'https://roofstockonchain.com' }),
    );
  });

  it('keeps the Margin / Settlement Asset text whole and drops N/A', () => {
    const { organizations } = organize(
      [assetRow()],
      [
        tradeXyzRow({ 'Margin / Settlement Asset': 'USDC; DAI; WETH (Arbitrum/Polygon/Base)' }),
        platformRow({ 'Margin / Settlement Asset': 'N/A' }),
      ],
    );

    expect(organizations.get('trade-xyz')!.marginSettlementAsset).toBe('USDC; DAI; WETH (Arbitrum/Polygon/Base)');
    expect(organizations.get('xstocks')).not.toHaveProperty('marginSettlementAsset');
  });
});
