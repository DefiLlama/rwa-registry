import { describe, expect, it, vi } from 'vitest';
import type { DateQuery } from '../../../src/discover/dateReader';
import { firstCode } from '../../../src/discover/readers/firstCode';
import { TimeoutError } from '../../../src/errors';
import { fakeDiscoverDeps } from '../../fakes/discover';
import { fakeRpc } from '../../fakes/rpc';

const query = (chain: string, address = '0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0'): DateQuery => ({
  chain,
  address,
});

describe('firstCode', () => {
  it('gives the day of the first code, on either side of a midnight, without searching down to the block', async () => {
    const MIDNIGHT = 1751241600;
    const HOUR = 3600;
    // A public node of one block an hour from a midnight, whose code starts at a given block.
    const hourly = (first: number) =>
      fakeRpc({
        evmHead: vi.fn(async () => 10_000),
        evmHasCode: vi.fn(async ({ block }: { block: number }) => block >= first),
        evmBlockTime: vi.fn(async (_chain: string, block: number) => MIDNIGHT + block * HOUR),
      });
    const dayOfBlock = (block: number) => new Date((MIDNIGHT + block * HOUR) * 1000).toISOString().slice(0, 10);
    // Block 4800 is the first hour of a day and block 4799 the last hour of the day before.
    const results = await Promise.all(
      [4800, 4799, 6123].map(
        async (first) => [first, await firstCode(query('plume'), fakeDiscoverDeps({ rpc: hourly(first) }))] as const,
      ),
    );

    for (const [first, result] of results)
      expect(result).toMatchObject({ date: dayOfBlock(first), basis: 'first-code' });
    expect(results[2][1]).toMatchObject({
      block: null,
      source: expect.stringMatching(/first code in blocks \d+ to \d+/),
    });
  });

  it("drops a chain's public node after its first timeout, so the rest of its addresses cost no wait", async () => {
    const timedOut = new TimeoutError({ source: 'rpc', reason: 'timeout', message: 'plume head: no answer' });
    const rpc = fakeRpc({ evmHead: vi.fn(async () => Promise.reject(timedOut)) });
    const deps = { ...fakeDiscoverDeps({ rpc }), log: vi.fn() };
    const first = await firstCode(query('plume'), deps);
    const later = await firstCode(query('plume', '0x1111111111111111111111111111111111111111'), deps);

    expect(first).toMatchObject({ date: null, reason: 'code-search-timeout' });
    expect(later).toMatchObject({
      date: null,
      reason: 'code-search-timeout',
      detail: expect.stringContaining('timed out in this run'),
    });
    expect(vi.mocked(rpc.evmHead)).toHaveBeenCalledTimes(1);
    expect(deps.log).toHaveBeenCalledTimes(1);
  });
});
