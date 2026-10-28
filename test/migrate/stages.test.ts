import { describe, expect, it } from 'vitest';
import type { RegistryFiles } from '../../src/import/importTypes';
import { callsOf } from '../../src/migrate/stages';

describe('callsOf', () => {
  it("lands a venue before a platform whose role names the venue's operator", () => {
    const files: RegistryFiles = new Map([
      [
        'assets/bstocks/platform.json',
        { identity: { slug: 'bstocks', name: 'bStocks' }, roles: [{ organization: 'binance', kind: 'issuer' }] },
      ],
      ['perps/binance/venue.json', { slug: 'binance', name: 'Binance', organization: 'binance' }],
      ['perps/binance/organization.json', { identity: { slug: 'binance', name: 'Binance' } }],
    ]);

    const ids = callsOf('platforms', files).map((call) => call.id);

    expect(ids).toEqual(['perps/binance/venue.json', 'assets/bstocks/platform.json']);
  });
});
