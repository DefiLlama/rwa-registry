import { describe, expect, it } from 'vitest';
import { perpsNames } from '../../src/import/perpsNames';
import type { RegistryFiles } from '../../src/import/importTypes';

const staged = (aaplName: string): RegistryFiles =>
  new Map([
    ['perps/xyz/organization.json', { slug: 'trade-xyz', name: 'trade[XYZ]' }],
    ['perps/xyz/venue.json', { slug: 'xyz', organization: 'trade-xyz' }],
    ['reference/underlyings/tesla-inc.json', { slug: 'tesla-inc', name: 'Tesla, Inc.' }],
    ['reference/underlyings/apple-inc.json', { slug: 'apple-inc', name: 'Apple Inc.' }],
    ['perps/xyz/tsla.json', { venue: 'xyz', symbol: 'TSLA', name: 'trade[XYZ] Tesla, Inc. Perp', tracks: 'tesla-inc' }],
    ['perps/xyz/aapl.json', { venue: 'xyz', symbol: 'AAPL', name: aaplName, tracks: 'apple-inc' }],
  ]);

describe('perpsNames', () => {
  it('drops a sheet Name the venue, the tracked name and Perp spell, and keeps one they do not', () => {
    const { files } = perpsNames(staged('trade[XYZ] Apple Perp'));

    expect(files.get('perps/xyz/tsla.json')).not.toHaveProperty('name');
    expect(files.get('perps/xyz/aapl.json')).toHaveProperty('name', 'trade[XYZ] Apple Perp');
  });
});
