import { describe, expect, it } from 'vitest';
import { applyFolds, type Fold } from '../../src/import/applyFolds';
import type { FileJson, RegistryFiles } from '../../src/import/importTypes';

const isin = (value: string) => ({ scheme: 'isin', value, source: null, verified: false });
const issuer = { organization: 'tesla-ir', kind: 'issuer' };

const files = (): RegistryFiles =>
  new Map<string, FileJson>([
    [
      'reference/underlyings/tesla-inc.json',
      { slug: 'tesla-inc', name: 'Tesla, Inc.', ticker: 'TSLA', class: 'equity' },
    ],
    [
      'reference/underlyings/tesla-inc-2921.json',
      {
        slug: 'tesla-inc-2921',
        name: 'Tesla Inc',
        class: 'equity',
        identifiers: [isin('US88160R1014')],
        roles: [issuer],
      },
    ],
    ['reference/underlyings/blue-owl.json', { slug: 'blue-owl', name: 'Blue Owl', class: 'equity' }],
    ['assets/xstocks/tslax.json', { slug: 'tslax', underlying: 'tesla-inc-2921' }],
    ['perps/xyz/tsla.json', { venue: 'xyz', symbol: 'TSLA', tracks: 'tesla-inc-2921' }],
    ['perps/xyz/owl.json', { venue: 'xyz', symbol: 'OWL', tracks: 'blue-owl' }],
  ]);

const fold = (drop: string, target: string, decision = 'confirmed'): Fold => ({
  file: `reference/underlyings/${drop}.json`,
  decision,
  target,
});

describe('applyFolds', () => {
  it('keeps one underlying per exposure, the other spelling as an alias, and repoints its rows', () => {
    const folded = applyFolds(files(), [fold('tesla-inc-2921', 'tesla-inc'), fold('blue-owl', '', 'rejected')]);

    expect(folded.files.get('reference/underlyings/tesla-inc.json')).toEqual({
      slug: 'tesla-inc',
      name: 'Tesla, Inc.',
      aliases: ['Tesla Inc'],
      ticker: 'TSLA',
      class: 'equity',
      identifiers: [isin('US88160R1014')],
      roles: [issuer],
    });
    expect(folded.files.has('reference/underlyings/tesla-inc-2921.json')).toBe(false);
    expect(folded.files.get('assets/xstocks/tslax.json')).toEqual({ slug: 'tslax', underlying: 'tesla-inc' });
    expect(folded.files.get('perps/xyz/tsla.json')).toMatchObject({ tracks: 'tesla-inc' });
    expect(folded.files.get('perps/xyz/owl.json')).toMatchObject({ tracks: 'blue-owl' });
    expect(folded).toMatchObject({ folded: 1, repointed: { asset: 1, perp_market: 1, role: 1 }, missing: [] });
  });

  it('lists a fold whose target does not exist and leaves its spelling apart', () => {
    const folded = applyFolds(files(), [fold('blue-owl', 'blue-owl-capital-inc')]);

    expect(folded.missing).toEqual(['blue-owl into blue-owl-capital-inc: no underlying blue-owl-capital-inc']);
    expect(folded.files).toEqual(files());
  });
});
