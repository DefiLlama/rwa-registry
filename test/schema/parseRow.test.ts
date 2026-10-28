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

  it('fails an identifier marked verified that names no source', () => {
    const identifiers = [{ scheme: 'isin', value: 'US88160R1014', source: null, verified: true }];
    const errors = parseRow('asset', tslaxWith({ identifiers }), file, { vocabularies });

    expect(errors).toEqual([expect.objectContaining({ path: 'sources.identifiers[0].source' })]);
  });
});
