import { describe, expect, it } from 'vitest';
import type { DateQuery } from '../../../src/discover/dateReader';
import { aptos } from '../../../src/discover/readers/aptos';
import { shouldBehaveLikeDateReader } from '../../behaviours/shouldBehaveLikeDateReader';
import { answering, fakeDiscoverDeps } from '../../fakes/discover';

const FA = '0x357b0b74bc833e95a115ad22604854d6b0fca151cecd94111770e5d6ffc9dc2b';
const query: DateQuery = { chain: 'aptos', chainId: 'aptos', family: 'aptos', address: FA };

describe('aptos date reader', () => {
  shouldBehaveLikeDateReader(aptos, [query, { ...query, address: `${FA}::coin::T` }]);

  it('dates the first activity of the asset type, its timestamp read as UTC', async () => {
    const http = answering(() => ({
      data: {
        fungible_asset_activities: [{ transaction_version: 1234, transaction_timestamp: '2025-06-30T00:30:00' }],
      },
    }));
    const [result] = await aptos.read([query], fakeDiscoverDeps({ http }));

    expect(result).toMatchObject({ date: '2025-06-30', block: 1234, basis: 'first-activity' });
  });
});
