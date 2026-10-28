import { describe, expect, it } from 'vitest';
import { mapVocabularies } from '../../src/import/mapVocabularies';

describe('mapVocabularies', () => {
  it('labels a value with its most common export spelling, keeps the other spelling as an alias and the file extras', () => {
    const markets = ['Stocks & Equities', 'Stocks & Equities', 'Stocks  & equities'].map((Category) => ({ Category }));
    const existing = { category: [{ slug: 'stocks-equities', label: 'Stocks and Equities', description: 'Shares' }] };

    const { files, slugOf } = mapVocabularies({ markets, platforms: [] }, existing, []);

    expect(files.get('reference/vocabularies/category.json')).toEqual([
      {
        slug: 'stocks-equities',
        label: 'Stocks & Equities',
        description: 'Shares',
        aliases: ['Stocks  & equities', 'Stocks and Equities'],
      },
    ]);
    expect(slugOf('category', 'Stocks  & equities')).toBe('stocks-equities');
  });
});
