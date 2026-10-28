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
      { chain: 'cosmos', chainId: 'cosmos', family: 'cosmos', address: 'cosmos1' },
      { chain: 'tron', chainId: 'tron', family: 'tron', address: 'T1' },
    ];
    const http = answering(() => ({ data: [{ date_created: 1555400628000 }] }));
    const results = await readDates(queries, fakeDiscoverDeps({ http }));

    expect(results.map(({ reason, date }) => reason ?? date)).toEqual(['no-reader', '2019-04-16']);
  });

  it('asks the history source only for what no reader dated, never over a date a reader found', async () => {
    const queries: DateQuery[] = [
      { chain: 'hedera', chainId: 'hedera', family: 'hedera', address: '0.0.1', asset },
      { chain: 'tron', chainId: 'tron', family: 'tron', address: 'T1', asset },
      { chain: 'tron', chainId: 'tron', family: 'tron', address: 'Tgone', asset },
    ];
    const http = answering(({ url }) => {
      if (url.startsWith(CHART)) return chartOf(['hedera', 'tron']);
      return url.endsWith('T1') ? { data: [{ date_created: 1555400628000 }] } : {};
    });
    const results = await readDates(queries, fakeDiscoverDeps({ http }, discoverConfig({ PRO_API_KEY: 'prokey' })));

    expect(results.map(({ date, basis }) => [date, basis])).toEqual([
      ['2024-01-01', 'first-stored-day'],
      ['2019-04-16', 'contract-created'],
      ['2024-01-01', 'first-stored-day'],
    ]);
  });

  it("keeps the reader's null for a capped read with a cursor or a chart that fails, and dates a rate-limited one", async () => {
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
      url.endsWith('/9') ? Promise.reject(new Error('chart down')) : chartOf(['solana', 'cronos', 'hedera']),
    );
    const results = await readDates(
      [
        { chain: 'solana', chainId: 'solana', family: 'solana', address: 'Mint1', asset },
        { chain: 'cronos', chainId: 'cronos', family: 'evm', address: '0x1', asset },
        { chain: 'hedera', chainId: 'hedera', family: 'hedera', address: '0.0.2', asset: { ...asset, legacyId: 9 } },
      ],
      fakeDiscoverDeps({ http, rpc }, capped),
    );

    expect(results.map(({ date, reason }) => [date, reason])).toEqual([
      [null, 'page-cap'],
      ['2024-01-01', null],
      [null, 'no-reader'],
    ]);
  });
});
