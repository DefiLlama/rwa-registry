import { describe, expect, it } from 'vitest';
import type { DateQuery } from '../../../src/discover/dateReader';
import { tron } from '../../../src/discover/readers/tron';
import { shouldBehaveLikeDateReader } from '../../behaviours/shouldBehaveLikeDateReader';
import { answering, fakeDiscoverDeps } from '../../fakes/discover';

const query: DateQuery = {
  chain: 'tron',
  chainId: 'tron',
  family: 'tron',
  address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
};

describe('tron date reader', () => {
  shouldBehaveLikeDateReader(tron, [query, { ...query, address: 'TCfCGjekyqmdYt1yxfUM5v5SDtaY6tuWik' }]);

  it("dates a contract at Tronscan's date_created, and an unknown one as not-found", async () => {
    const http = answering(({ url }) =>
      url.endsWith(query.address) ? { data: [{ date_created: 1555400628000 }] } : {},
    );
    const [known, unknown] = await tron.read([query, { ...query, address: 'Tunknown' }], fakeDiscoverDeps({ http }));

    expect(known).toMatchObject({ date: '2019-04-16', basis: 'contract-created' });
    expect(unknown).toMatchObject({ date: null, reason: 'not-found' });
  });
});
