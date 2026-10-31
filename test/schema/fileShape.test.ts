import { describe, expect, it } from 'vitest';
import { fieldPath, parseRow, toFile, toRow } from '../../src/schema';

const tslaxRow = {
  slug: 'tslax',
  legacyId: 257,
  canonicalMarketId: 'TSLAx',
  symbol: 'TSLAx',
  name: 'Tesla xStock',
  underlying: 'tesla-inc',
  structure: 'stock-backed',
  type: 'asset',
  rwaClassification: 'rwa',
  category: ['stocks-equities'],
  redeemable: true,
  coingeckoId: null,
  activeAumReviewed: true,
  suspicious: false,
  delisted: false,
};

describe('fileShape', () => {
  it('nests an asset row into its named blocks, and reads the file back as the same row', () => {
    const file = toFile('asset', { ...tslaxRow, deployments: [{ chain: 'solana', address: 'Xs', primary: true }] });

    expect(file).toEqual({
      identity: { slug: 'tslax', symbol: 'TSLAx', name: 'Tesla xStock', legacyId: 257, canonicalMarketId: 'TSLAx' },
      exposure: { underlying: 'tesla-inc' },
      class: { structure: 'stock-backed', type: 'asset', rwaClassification: 'rwa', category: ['stocks-equities'] },
      terms: { redeemable: true },
      sources: { coingeckoId: null },
      review: { activeAumReviewed: true, suspicious: false, delisted: false },
      deployments: [{ chain: 'solana', address: 'Xs', primary: true }],
    });
    expect(Object.keys(file)).toEqual(['identity', 'exposure', 'class', 'terms', 'sources', 'review', 'deployments']);
    expect(toRow('asset', file)).toEqual({
      ...tslaxRow,
      deployments: [{ chain: 'solana', address: 'Xs', primary: true }],
    });
  });

  it('names a market field in its file by another key where the block says so', () => {
    const file = toFile('perp_market', {
      symbol: 'TSLA',
      tracks: 'tesla-inc',
      tracksAsset: null,
      structure: 'stock-perp',
    });

    expect(file).toEqual({
      identity: { symbol: 'TSLA' },
      tracks: { underlying: 'tesla-inc', asset: null, structure: 'stock-perp' },
    });
    expect(toRow('perp_market', file)).toMatchObject({ tracks: 'tesla-inc', tracksAsset: null });
    expect([fieldPath('perp_market', 'tracksAsset'), fieldPath('asset', 'redeemable')]).toEqual([
      'tracks.asset',
      'terms.redeemable',
    ]);
  });

  it('refuses a field written at the top of a file whose schema puts it in a block', () => {
    const file = { ...toFile('asset', tslaxRow), redeemable: true };

    const errors = parseRow('asset', file, 'assets/xstocks/tslax.json');

    expect(errors).toEqual([expect.objectContaining({ path: 'redeemable' })]);
  });

  it('asks for a required field at its path in the block', () => {
    const { identity, ...rest } = toFile('asset', tslaxRow) as { identity: Record<string, unknown> };
    const { legacyId: _, ...withoutId } = identity;

    const errors = parseRow('asset', { ...rest, identity: withoutId }, 'assets/xstocks/tslax.json');

    expect(errors).toEqual([expect.objectContaining({ path: 'identity.legacyId' })]);
  });
});
