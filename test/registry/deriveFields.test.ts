import { describe, expect, it } from 'vitest';
import { deriveFields } from '../../src/registry/deriveFields';
import { assetFile, baseTree, contractlessTslax, registryOf, tslaMarketFile, tslaxFile, withClass, xstocksPlatform, xyzVenue } from '../fixtures/tree';

const derive = (tree: Record<string, unknown>, at = '2026-10-25') => deriveFields(registryOf({ ...baseTree(), ...tree }), at);

describe('deriveFields', () => {
  it('makes SKY both a stablecoin and a governance token, of kind governance', () => {
    const { asset } = derive({
      'reference/vocabularies/category.json': [
        { slug: 'stocks-equities', label: 'Stocks & Equities' },
        { slug: 'rwa-stablecoins', label: 'RWA Stablecoins', impliesStablecoin: true },
      ],
      'reference/vocabularies/asset-class.json': [
        { slug: 'stock-backed', label: 'Stock-Backed' },
        { slug: 'governance-token', label: 'Governance Token', impliesGovernance: true },
      ],
      'assets/xstocks/sky.json': assetFile('sky', 64, { structure: 'governance-token', category: ['rwa-stablecoins'] }),
    });

    expect(asset.find((row) => row.slug === 'sky')).toMatchObject({ stablecoin: true, governance: true, kind: 'governance' });
    expect(asset.find((row) => row.slug === 'tslax')).toMatchObject({ stablecoin: false, governance: false, kind: 'claim' });
  });

  it('publishes an override from the class block over the derived flag, and the kind follows the published flags', () => {
    const { asset } = derive({
      'reference/vocabularies/category.json': [
        { slug: 'stocks-equities', label: 'Stocks & Equities' },
        { slug: 'rwa-stablecoins', label: 'RWA Stablecoins', impliesStablecoin: true },
      ],
      'reference/vocabularies/asset-class.json': [
        { slug: 'stock-backed', label: 'Stock-Backed' },
        { slug: 'stable-yield-wrapper', label: 'Stablecoin yield wrapper' },
      ],
      'assets/xstocks/susde.json': withClass(assetFile('susde', 8818, { category: ['rwa-stablecoins'] }), {
        stablecoin: false,
        flagReason: 'the server publishes false today',
      }),
      'assets/xstocks/apyusd.json': assetFile('apyusd', 2994, { category: ['rwa-stablecoins'] }),
      'assets/xstocks/tslax.json': withClass(tslaxFile(), { stablecoin: true, flagReason: 'the server publishes true' }),
    });
    const flags = (slug: string) => {
      const row = asset.find((one) => one.slug === slug)!;
      return [row.stablecoin, row.governance, row.kind];
    };

    expect(flags('susde')).toEqual([false, false, 'claim']);
    expect(flags('apyusd')).toEqual([true, false, 'stablecoin']);
    expect(flags('tslax')).toEqual([true, false, 'stablecoin']);
  });

  it('builds a deployment with no known contract as address null and keeps its chain on the asset', () => {
    const { asset, deployment } = derive({ 'assets/xstocks/tslax.json': contractlessTslax() });

    expect(deployment.find((row) => row.chain === 'base')).toEqual({ asset: 'tslax', chain: 'base', address: null });
    expect(asset.find((row) => row.slug === 'tslax')!.chains).toEqual(['solana', 'ethereum', 'base']);
  });

  it('derives status from the events at the build date', () => {
    const { asset, perp_market, venue, organization } = derive({
      'assets/xstocks/tslax.json': { ...tslaxFile(), events: [{ kind: 'retirement', date: '2026-10-24' }] },
      'assets/xstocks/platform.json': { ...xstocksPlatform(), events: [{ kind: 'delisting', date: '2026-11-01' }] },
      'perps/xyz/tsla.json': { ...tslaMarketFile(), events: [{ kind: 'delisting', date: null }] },
      'perps/xyz/venue.json': {
        ...xyzVenue(),
        events: [
          { kind: 'delisting', date: '2026-03-01' },
          { kind: 'listing', date: '2026-06-01' },
        ],
      },
    });

    expect(asset[0].status).toBe('retired');
    expect(perp_market[0].status).toBe('delisted');
    expect(venue[0].status).toBe('listed');
    expect(organization.find((row) => row.slug === 'xstocks')!.status).toBe('listed');
  });

  it('ends a market from the day of its split, its uppercase symbol matched to the lowercase key', () => {
    const split = { 'perps/xyz/tsla.json': { ...tslaMarketFile(), events: [{ kind: 'split', date: '2026-06-01' }] } };

    expect([derive(split, '2026-05-31'), derive(split, '2026-06-01')].map((r) => r.perp_market[0].status)).toEqual([
      'listed',
      'retired',
    ]);
  });

  it('writes the lowercase market id and the chains of the deployments that have not ended', () => {
    const tslax = tslaxFile();
    const { asset, perp_market } = derive({
      'assets/xstocks/tslax.json': {
        ...tslax,
        deployments: [tslax.deployments[0], { ...tslax.deployments[1], events: [{ kind: 'migration', date: '2026-10-01' }] }],
      },
    });

    expect(perp_market[0].id).toBe('xyz:tsla');
    expect(asset[0].chains).toEqual(['solana']);
  });

  it("takes the primary chain from the primary deployment, else the platform's, and the protocol ids from the issuer roles", () => {
    const { asset } = derive({
      'assets/xstocks/platform.json': { ...xstocksPlatform(), platform: { primaryChain: 'ethereum' } },
      'assets/xstocks/tslay.json': assetFile('tslay', 9001, {
        roles: [{ organization: 'backed-assets-je-limited', kind: 'issuer', protocolIds: [6378] }],
      }),
    });

    expect(asset.map((row) => [row.slug, row.primaryChain, row.issuerProtocolIds])).toEqual([
      ['tslax', 'solana', null],
      ['tslay', 'ethereum', [6378]],
    ]);
  });

  it('publishes the protocol ids an asset holds itself when no issuer role holds any', () => {
    const { asset } = derive({
      'assets/xstocks/tslay.json': assetFile('tslay', 9001, { protocolIds: [118, 'parent#sky'] }),
    });

    expect(asset.map((row) => [row.slug, row.issuerProtocolIds])).toEqual([
      ['tslax', null],
      ['tslay', [118, 'parent#sky']],
    ]);
  });
});

