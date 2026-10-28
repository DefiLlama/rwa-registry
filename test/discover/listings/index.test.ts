import { describe, expect, it } from 'vitest';
import { readListings } from '../../../src/discover/listings';
import { answering, fakeDiscoverDeps } from '../../fakes/discover';
import { market } from './market';

describe('readListings', () => {
  it('reads the listing field and answers needs-history-dump where the venue has no field or no date', async () => {
    const http = answering(() => ({ symbols: [{ symbol: 'TSLAUSDT', onboardDate: 1769591400000 }] }));
    const [binance, undatedOnBinance, ostium] = await readListings(
      [market(), market({ symbol: 'AAPLUSDT' }), market({ venue: 'ostium', symbol: 'TSLA-USD' })],
      fakeDiscoverDeps({ http }),
    );

    expect(binance).toMatchObject({ date: '2026-01-28', basis: 'listing-field' });
    expect(undatedOnBinance).toMatchObject({ date: null, reason: 'needs-history-dump' });
    expect(ostium).toMatchObject({ date: null, reason: 'needs-history-dump' });
  });
});
