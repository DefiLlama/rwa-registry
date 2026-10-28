import { describe, expect, it } from 'vitest';
import { perpsTickerCalls } from '../../src/import/perpsTickers';
import type { Registry } from '../../src/schema';
import { perpsRow } from '../fixtures/import/rows';

const registry = {
  underlying: [{ slug: 'robinhood-markets-inc', ticker: 'HOOD' }],
  asset: [],
  perp_market: [
    { venue: 'xyz', symbol: 'HOOD', tracks: 'robinhood-markets-inc' },
    { venue: 'xyz', symbol: 'ROBN', tracks: 'robinhood-markets-inc' },
  ],
} as unknown as Registry;

describe('perpsTickerCalls', () => {
  it('lists the perps rows whose own ticker the underlying ticker replaces, under the underlying', () => {
    const rows = [
      perpsRow({ '*RWA ID': '1', 'Canonical Market ID': 'xyz:HOOD', 'Reference Ticker': 'HOOD' }),
      perpsRow({ '*RWA ID': '2', 'Canonical Market ID': 'xyz:ROBN', 'Reference Ticker': 'ROBN' }),
    ];

    expect(perpsTickerCalls(rows, registry).map((call) => call.line)).toEqual([
      'robinhood-markets-inc publishes HOOD: 2 xyz:ROBN (ROBN)',
    ]);
  });
});
