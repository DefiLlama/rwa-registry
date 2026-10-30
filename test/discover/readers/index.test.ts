import { describe, expect, it, vi } from 'vitest';
import type { DateQuery } from '../../../src/discover/dateReader';
import { readDates } from '../../../src/discover/readers';
import { RateLimitedError } from '../../../src/errors';
import { answering, discoverConfig, fakeDiscoverDeps } from '../../fakes/discover';
import { fakeRpc } from '../../fakes/rpc';

const CHART = 'https://pro-api.llama.fi/prokey/rwa/chart/asset/';
// Every chain of the fake chart holds a value from 2024-01-01.
const chartOf = (chains: string[]) => [
  { timestamp: 1704067200, chains: Object.fromEntries(chains.map((chain) => [chain, { totalSupply: 1 }])) },
];
const asset = { legacyId: 7, deploymentsOnChain: 1 };

describe('readDates', () => {
  it('answers no-reader for a family without a reader and keeps the order of the queries', async () => {
    const queries: DateQuery[] = [
      { chain: 'cosmos', address: 'cosmos1' },
      { chain: 'tron', address: 'T1' },
    ];
    const http = answering(() => ({ data: [{ date_created: 1555400628000 }] }));
    const results = await readDates(queries, fakeDiscoverDeps({ http }));

    expect(results.map(({ reason, date }) => reason ?? date)).toEqual(['no-reader', '2019-04-16']);
  });

  it('answers unknown-chain for a chain the sdk does not know and asks no source, the history included', async () => {
    const http = answering(() => chartOf(['zksync']));
    const query: DateQuery = { chain: 'zksync', address: '0x1', asset };
    const results = await readDates([query], fakeDiscoverDeps({ http }, discoverConfig({ PRO_API_KEY: 'prokey' })));

    expect(results.map(({ reason }) => reason)).toEqual(['unknown-chain']);
    expect(http.json).not.toHaveBeenCalled();
  });

  it('asks the history source only for what no reader dated, never over a date a reader found', async () => {
    const queries: DateQuery[] = [
      { chain: 'icp', address: 'ryjl3-tyaaa-aaaaa-aaaba-cai', asset },
      { chain: 'tron', address: 'T1', asset },
      { chain: 'tron', address: 'Tgone', asset },
    ];
    const http = answering(({ url }) => {
      if (url.startsWith(CHART)) return chartOf(['icp', 'tron']);
      return url.endsWith('T1') ? { data: [{ date_created: 1555400628000 }] } : {};
    });
    const results = await readDates(queries, fakeDiscoverDeps({ http }, discoverConfig({ PRO_API_KEY: 'prokey' })));

    expect(results.map(({ date, basis }) => [date, basis])).toEqual([
      ['2024-01-01', 'first-stored-day'],
      ['2019-04-16', 'contract-created'],
      ['2024-01-01', 'first-stored-day'],
    ]);
  });

  it("dates a capped read and a rate-limited one at the first stored day, and keeps the reader's null when the chart fails", async () => {
    const solana = { ...discoverConfig({ PRO_API_KEY: 'prokey' }) };
    const capped = {
      ...solana,
      sources: { ...solana.sources, solana: { ...solana.sources.solana, pageSize: 2, pagesPerRun: 1 } },
    };
    const rpc = fakeRpc({
      solanaSignatures: vi.fn(async () => [
        { signature: 'a', slot: 2, blockTime: 1751328000 },
        { signature: 'b', slot: 1, blockTime: 1751241600 },
      ]),
      evmHead: vi.fn(async () =>
        Promise.reject(new RateLimitedError({ source: 'rpc', reason: 'rate-limited', message: '429' })),
      ),
    });
    const http = answering(({ url }) =>
      url.endsWith('/9') ? Promise.reject(new Error('chart down')) : chartOf(['solana', 'cronos', 'icp']),
    );
    const results = await readDates(
      [
        { chain: 'solana', address: 'Mint1', asset },
        { chain: 'cronos', address: '0x1', asset },
        {
          chain: 'icp',
          address: 'mxzaz-hqaaa-aaaar-qaada-cai',
          asset: { ...asset, legacyId: 9 },
        },
      ],
      fakeDiscoverDeps({ http, rpc }, capped),
    );

    expect(results.map(({ date, reason }) => [date, reason])).toEqual([
      ['2024-01-01', null],
      ['2024-01-01', null],
      [null, 'no-reader'],
    ]);
  });
});
