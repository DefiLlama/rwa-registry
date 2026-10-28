import { describe, expect, it } from 'vitest';
import type { HttpRequest } from '../../../src/clients/http';
import { binance } from '../../../src/discover/listings/binance';
import { bybit } from '../../../src/discover/listings/bybit';
import { gate } from '../../../src/discover/listings/gate';
import { okx } from '../../../src/discover/listings/okx';
import type { ListingReader } from '../../../src/discover/listings/listingReader';
import { answering, fakeDiscoverDeps } from '../../fakes/discover';
import { market } from './market';

// 2026-01-28 09:10 UTC, Binance's TSLAUSDT onboardDate.
const MS = 1769591400000;

const cases: [ListingReader, string, (request: HttpRequest) => unknown][] = [
  [binance, 'TSLAUSDT', () => ({ symbols: [{ symbol: 'TSLAUSDT', onboardDate: MS }] })],
  [
    bybit,
    'TSLAUSDT',
    ({ query }) =>
      query?.cursor
        ? { result: { list: [{ symbol: 'TSLAUSDT', launchTime: String(MS) }], nextPageCursor: '' } }
        : { result: { list: [{ symbol: 'AAPLUSDT', launchTime: '1' }], nextPageCursor: 'page2' } },
  ],
  [okx, 'TSLA-USDT-SWAP', () => ({ data: [{ instId: 'TSLA-USDT-SWAP', listTime: String(MS) }] })],
  [gate, 'TSLA_USDT', () => [{ name: 'TSLA_USDT', create_time: MS / 1000 }]],
];

describe('the venue listing fields', () => {
  for (const [reader, symbol, answer] of cases)
    it(`${reader.adapter}: dates a market at its listing field and an unlisted one as not-found`, async () => {
      const targets = [market({ venue: reader.adapter, symbol }), market({ venue: reader.adapter, symbol: 'GONE' })];
      const [listed, gone] = await reader.read(targets, fakeDiscoverDeps({ http: answering(answer) }));

      expect(listed).toMatchObject({ date: '2026-01-28', basis: 'listing-field' });
      expect(gone).toMatchObject({ date: null, reason: 'not-found' });
    });
});
