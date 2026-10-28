import { describe, expect, it } from 'vitest';
import type { HttpRequest } from '../../../src/clients/http';
import type { DateQuery } from '../../../src/discover/dateReader';
import { sui } from '../../../src/discover/readers/sui';
import { shouldBehaveLikeDateReader } from '../../behaviours/shouldBehaveLikeDateReader';
import { answering, fakeDiscoverDeps } from '../../fakes/discover';

const PKG = '0x4dea4916aa61f522aca69c4e7265b8e3bdd65d3947f4fb9aaa6d87e0dfac35fd';
const query: DateQuery = { chain: 'sui', chainId: 'sui', family: 'sui', address: `${PKG}::rcusd::RCUSD` };

describe('sui date reader', () => {
  shouldBehaveLikeDateReader(sui, [query, { ...query, address: `${PKG}::rcusdp::RCUSDP` }]);

  it("dates a coin type at its package's publish transaction", async () => {
    const http = answering(({ body }: HttpRequest) =>
      (body as { method: string }).method === 'sui_getObject'
        ? { result: { data: { previousTransaction: 'Dig3st' } } }
        : { result: { timestampMs: '1751241600000', checkpoint: '150000000' } },
    );
    const [result] = await sui.read([query], fakeDiscoverDeps({ http }));

    expect(result).toMatchObject({
      date: '2025-06-30',
      block: 150000000,
      source: 'https://suiscan.xyz/mainnet/tx/Dig3st',
      basis: 'package-published',
    });
  });
});
