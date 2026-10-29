import { describe, expect, it } from 'vitest';
import { SchemaError } from '../../src/errors';
import { parseRow } from '../../src/schema';
import { tslaxWith } from '../fixtures/tree';

const vocabularies = {
  category: ['stocks-equities', 'fiat-stablecoins'],
  'asset-class': ['stock-backed'],
  'asset-group': ['public-equities'],
  type: ['asset'],
  'rwa-classification': ['true-rwa'],
  'role-kind': ['issuer'],
  'label-kind': ['excluded-holder'],
};
const file = 'assets/xstocks/tslax.json';

describe('parseRow', () => {
  it('names the nearest value on a vocabulary typo', () => {
    const errors = parseRow('asset', tslaxWith({ structure: 'stock-backd' }), file, { vocabularies });

    expect(errors).toHaveLength(1);
    const [error] = errors as SchemaError[];
    expect(error).toBeInstanceOf(SchemaError);
    expect(error).toMatchObject({ file, path: 'class.structure', didYouMean: 'stock-backed' });
  });

  it('fails an identifier whose source is empty', () => {
    const identifiers = [{ scheme: 'isin', value: 'US88160R1014', source: '', verified: false }];
    const errors = parseRow('asset', tslaxWith({ identifiers }), file, { vocabularies });

    expect(errors).toEqual([expect.objectContaining({ path: 'sources.identifiers[0].source' })]);
  });

  it('keeps the yields pool ids and fails one that is not a UUID', () => {
    const pools = ['fda10983-9dcd-49e9-9332-b227dc244d5d', 'dde4e536-0f20-4a73-b9b4-42ec2e24dc2b'];
    const parsed = parseRow('asset', tslaxWith({ yieldPoolIds: pools }), file, { vocabularies });
    const errors = parseRow('asset', tslaxWith({ yieldPoolIds: [pools[0], 'cana-pool'] }), file, { vocabularies });

    expect(parsed).toMatchObject({ sources: { yieldPoolIds: pools } });
    expect(errors).toEqual([expect.objectContaining({ path: 'sources.yieldPoolIds[1]' })]);
  });

  it("refuses a twitter link on an asset, since its platform holds the asset's social links", () => {
    const links = { website: ['https://xstocks.com/'], twitter: 'https://x.com/xStocksFi' };
    const errors = parseRow('asset', tslaxWith({ links }), file, { vocabularies });

    expect(errors).toEqual([expect.objectContaining({ path: 'about.links.twitter' })]);
  });

  it('keeps the logo an underlying carries for the markets that track it', () => {
    const tesla = {
      slug: 'tesla-inc',
      name: 'Tesla, Inc.',
      logo: 'https://icons.llamao.fi/icons/rwa/tsla.png',
      exposure: 'public-equities',
    };

    expect(
      parseRow('underlying', tesla, 'reference/underlyings/equity/tesla-inc.json', { vocabularies }),
    ).toMatchObject({ logo: tesla.logo });
  });

  it('fails an identifier marked verified that names no source', () => {
    const identifiers = [{ scheme: 'isin', value: 'US88160R1014', source: null, verified: true }];
    const errors = parseRow('asset', tslaxWith({ identifiers }), file, { vocabularies });

    expect(errors).toEqual([expect.objectContaining({ path: 'sources.identifiers[0].source' })]);
  });
});
