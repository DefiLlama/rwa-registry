import { describe, expect, it, vi } from 'vitest';
import type { HttpRequest } from '../../../src/clients/http';
import type { DateQuery } from '../../../src/discover/dateReader';
import { firstStoredDay } from '../../../src/discover/readers/history';
import { answering, discoverConfig, fakeDiscoverDeps } from '../../fakes/discover';

const DAY = 86_400;
const query: DateQuery = {
  chain: 'avax',
  address: '0xb3a66127ccb143bfb01d3aecd3ce9d17381b130d',
  asset: { legacyId: 621, deploymentsOnChain: 1 },
};
const withKey = () => discoverConfig({ PRO_API_KEY: 'prokey' });

// The chart rows out of order, as a test of the minimum: avax holds a zero leg on 2024-01-01, its first value on 2024-01-03.
const chart = [
  { timestamp: 1704067200 + 5 * DAY, chains: { avax: { totalSupply: 10, onChainMcap: 10 } } },
  { timestamp: 1704067200, chains: { ethereum: { totalSupply: 5 }, avax: { totalSupply: 0, onChainMcap: 0 } } },
  { timestamp: 1704067200 + 2 * DAY, chains: { avax: { totalSupply: 0, onChainMcap: 7 } } },
  { timestamp: 1704067200 + DAY, chains: { ethereum: { totalSupply: 5 }, xdai: { totalSupply: 3 } } },
];

describe('history date source', () => {
  it('dates a deployment at the first day its chain holds a value above zero, with the key hidden in the source', async () => {
    const http = answering(() => chart);
    const result = await firstStoredDay(query, fakeDiscoverDeps({ http }, withKey()));

    expect(result).toMatchObject({
      date: '2024-01-03',
      block: null,
      source: 'https://pro-api.llama.fi/<key>/rwa/chart/asset/621',
      basis: 'first-stored-day',
    });
    const [request] = vi.mocked(http.json).mock.calls[0] as [HttpRequest];
    expect(request.url).toBe('https://pro-api.llama.fi/prokey/rwa/chart/asset/621');
  });

  it("reads a chain under the chart's own key from config, gnosis as xdai", async () => {
    const result = await firstStoredDay(
      { ...query, chain: 'gnosis' },
      fakeDiscoverDeps({ http: answering(() => chart) }, withKey()),
    );

    expect(result).toMatchObject({ date: '2024-01-02', basis: 'first-stored-day' });
  });

  it('answers null for a chain the chart does not hold', async () => {
    const result = await firstStoredDay(
      { ...query, chain: 'cronos' },
      fakeDiscoverDeps({ http: answering(() => chart) }, withKey()),
    );

    expect(result).toBeNull();
  });

  it('asks nothing without the key, without an asset, or when two of the asset deployments share the chain leg', async () => {
    const http = answering(() => chart);
    const shared = { ...query, asset: { legacyId: 621, deploymentsOnChain: 2 } };

    expect(await firstStoredDay(query, fakeDiscoverDeps({ http }))).toBeNull();
    expect(await firstStoredDay({ ...query, asset: undefined }, fakeDiscoverDeps({ http }, withKey()))).toBeNull();
    expect(await firstStoredDay(shared, fakeDiscoverDeps({ http }, withKey()))).toBeNull();
    expect(vi.mocked(http.json)).not.toHaveBeenCalled();
  });

  it("reads an asset's chart once per run for all its deployments", async () => {
    const http = answering(() => chart);
    const deps = fakeDiscoverDeps({ http }, withKey());
    await Promise.all([firstStoredDay(query, deps), firstStoredDay({ ...query, chain: 'gnosis' }, deps)]);

    expect(vi.mocked(http.json)).toHaveBeenCalledTimes(1);
  });
});
