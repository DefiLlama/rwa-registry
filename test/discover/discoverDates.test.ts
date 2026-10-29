import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { HttpRequest } from '../../src/clients/http';
import { discoverDates } from '../../src/discover/discoverDates';
import type { DiscoverDeps } from '../../src/discover/discoverDeps';
import { RateLimitedError } from '../../src/errors';
import { answering, discoverConfig, fakeDiscoverDeps } from '../fakes/discover';
import { fakeRpc } from '../fakes/rpc';
import { assetFile, baseTree, undatedTslax, writeTree, type Tree } from '../fixtures/tree';
import { evmNode } from './readers/jsonRpc';

const TSLAX = 'assets/xstocks/tslax.json';
const MARKET = 'perps/xyz/tsla.json';

const undated = () => writeTree({ ...baseTree(), [TSLAX]: undatedTslax() });

const fileAt = (root: string, path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const datesOf = (root: string, path: string): (string | null)[] =>
  fileAt(root, path).deployments.map(({ deployedAt }: { deployedAt: string | null }) => deployedAt);

const chainRpc = () =>
  fakeRpc({
    evmHead: vi.fn(async () => 100),
    evmHasCode: vi.fn(async ({ block }: { block: number }) => block >= 37),
    evmBlockTime: vi.fn(async () => 1751241600),
    solanaSignatures: vi.fn(async () => [{ signature: 'sig0', slot: 5, blockTime: 1751328000 }]),
  });

describe('discoverDates', () => {
  it('sets deployedAt in the asset file of every undated deployment it dates, with the source and basis in the summary', async () => {
    const root = undated();

    const summary = await discoverDates(root, { platform: 'xstocks' }, fakeDiscoverDeps({ rpc: chainRpc() }));

    expect(datesOf(root, TSLAX)).toEqual(['2025-07-01', '2025-06-30']);
    expect(summary.dated).toContainEqual({
      file: TSLAX,
      path: 'deployments[0].deployedAt',
      date: '2025-07-01',
      source: 'https://explorer.solana.com/tx/sig0',
      basis: 'first-signature',
    });
  });

  it('sets the first stored day for a deployment no reader dates, and none for two that share a chain leg', async () => {
    const tree: Tree = { ...baseTree() };
    tree['reference/chains/hedera.json'] = { slug: 'hedera', label: 'Hedera', addressFamily: 'hedera' };
    tree['reference/chains/algorand.json'] = { slug: 'algorand', label: 'Algorand', addressFamily: 'algorand' };
    tree['assets/xstocks/hist.json'] = assetFile('hist', 950, {
      deployments: [
        { chain: 'hedera', address: '0.0.1', deployedAt: null, primary: true },
        { chain: 'algorand', address: 'ALGO1', deployedAt: null },
        { chain: 'algorand', address: 'ALGO2', deployedAt: '2024-01-01' },
      ],
    });
    const root = writeTree(tree);
    const http = answering(() => [
      { timestamp: 1714521600, chains: { hedera: { totalSupply: 2 }, algorand: { totalSupply: 2 } } },
    ]);
    const deps = fakeDiscoverDeps({ http }, discoverConfig({ PRO_API_KEY: 'prokey' }));

    const summary = await discoverDates(root, { platform: 'xstocks' }, deps);

    expect(datesOf(root, 'assets/xstocks/hist.json')).toEqual(['2024-05-01', null, '2024-01-01']);
    expect(summary.dated).toEqual([
      expect.objectContaining({
        path: 'deployments[0].deployedAt',
        source: 'https://pro-api.llama.fi/<key>/rwa/chart/asset/950',
        basis: 'first-stored-day',
      }),
    ]);
    expect(summary.lanes.algorand).toMatchObject({ asked: 1, found: 0, nulls: { 'no-reader': 1 } });
  });

  it('asks only the deployments still undated on a rerun, and nothing once every one has its date', async () => {
    const root = undated();
    const rpc = chainRpc();

    await discoverDates(root, { platform: 'xstocks', limit: 1 }, fakeDiscoverDeps({ rpc }));
    const second = await discoverDates(root, { platform: 'xstocks' }, fakeDiscoverDeps({ rpc }));
    const third = await discoverDates(root, { platform: 'xstocks' }, fakeDiscoverDeps({ rpc }));

    expect(datesOf(root, TSLAX)).toEqual(['2025-07-01', '2025-06-30']);
    expect([second.asked, third.asked]).toEqual([1, 0]);
    expect(vi.mocked(rpc.solanaSignatures)).toHaveBeenCalledTimes(1);
  });

  it('leaves a rate-limited deployment undated with its reason, so the next run asks it again', async () => {
    const root = undated();
    const rpc = fakeRpc({
      evmHead: vi.fn(async () =>
        Promise.reject(new RateLimitedError({ source: 'rpc', reason: 'rate-limited', message: '429' })),
      ),
      solanaSignatures: vi.fn(async () => [{ signature: 'sig0', slot: 5, blockTime: 1751328000 }]),
    });

    const summary = await discoverDates(root, { platform: 'xstocks' }, fakeDiscoverDeps({ rpc }));

    expect(datesOf(root, TSLAX)).toEqual(['2025-07-01', null]);
    expect(summary.nulls).toEqual({ 'rate-limited': { count: 1, detail: 'rpc: 429' } });
  });

  it('reports a capped Solana read as page-cap, leaves the mint undated, and the next run walks it from the head', async () => {
    const root = undated();
    const discover = discoverConfig();
    const solana = { ...discover.sources.solana, pageSize: 2, pagesPerRun: 2 };
    const capped = { ...discover, sources: { ...discover.sources, solana } };
    const all = [0, 1, 2, 3, 4].map((day) => ({
      signature: `sig${day}`,
      slot: 9 - day,
      blockTime: 1751328000 - day * 86400,
    }));
    const solanaSignatures = vi.fn(async ({ before, limit }: { before: string | null; limit: number }) => {
      const start = before ? all.findIndex(({ signature }) => signature === before) + 1 : 0;
      return all.slice(start, start + limit);
    });
    const deps = () => fakeDiscoverDeps({ rpc: { ...chainRpc(), solanaSignatures } }, capped);

    const first = await discoverDates(root, { platform: 'xstocks' }, deps());
    const second = await discoverDates(root, { platform: 'xstocks' }, deps());

    expect(datesOf(root, TSLAX)[0]).toBeNull();
    expect([first.nulls, second.nulls]).toEqual([
      { 'page-cap': { count: 1, detail: expect.stringContaining('over 4 signatures this run') } },
      { 'page-cap': { count: 1, detail: expect.stringContaining('over 4 signatures this run') } },
    ]);
    expect(solanaSignatures.mock.calls.map(([call]) => call.before)).toEqual([null, 'sig1', null, 'sig1']);
  });

  it("sets a fast chain's dates while a slow chain is still reading, since each chain is its own lane", async () => {
    const root = undated();
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const solanaSignatures = vi.fn(async () => {
      await gate;
      return [{ signature: 'sig0', slot: 5, blockTime: 1751328000 }];
    });
    const run = discoverDates(
      root,
      { platform: 'xstocks' },
      fakeDiscoverDeps({ rpc: { ...chainRpc(), solanaSignatures } }),
    );

    await vi.waitFor(() => expect(datesOf(root, TSLAX)).toEqual([null, '2025-06-30']));
    release();
    await run;
    expect(datesOf(root, TSLAX)).toEqual(['2025-07-01', '2025-06-30']);
  });

  it("keeps the Alchemy EVM lanes moving while Solana's pages on the same key hang, with rate limits mixed in", async () => {
    // Three EVM chains on the Alchemy key and Solana, four deployments each, the way the full fill meets them.
    const ALCHEMY_CHAINS = ['bsc', 'base', 'ink'];
    const tree: Tree = { ...baseTree() };
    for (const slug of ALCHEMY_CHAINS)
      tree[`reference/chains/${slug}.json`] = { slug, label: slug, addressFamily: 'evm' };
    const hex = (chain: number, index: number) => `0x${String(chain + 1).repeat(39)}${index}`;
    const mint = (index: number) => `Mint${index}111111111111111111111111111111111111`.slice(0, 44);
    for (let index = 0; index < 4; index++)
      tree[`assets/xstocks/many${index}.json`] = assetFile(`many${index}`, 900 + index, {
        deployments: [
          { chain: 'solana', address: mint(index), deployedAt: null, primary: true },
          ...ALCHEMY_CHAINS.map((chain, at) => ({ chain, address: hex(at, index), deployedAt: null })),
        ],
      });
    const root = writeTree(tree);
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const node = evmNode(37);
    let calls = 0;
    const http = {
      json: vi.fn(async (request: HttpRequest) => {
        if (request.url.includes('solana-mainnet')) {
          await gate;
          return { result: [{ signature: 'sig0', slot: 5, blockTime: 1751328000 }] };
        }
        // Every fifth EVM call is rate limited once, as a busy key answers.
        if (++calls % 5 === 0)
          return { error: { code: 429, message: 'Your app has exceeded its compute units per second capacity' } };
        return node.json(request);
      }) as DiscoverDeps['clients']['http']['json'],
    };
    const keyed = discoverConfig({ ALCHEMY_KEY: 'test-key' });
    const run = discoverDates(root, { platform: 'xstocks' }, fakeDiscoverDeps({ http }, keyed));

    await vi.waitFor(() => {
      for (let index = 0; index < 4; index++)
        expect(datesOf(root, `assets/xstocks/many${index}.json`)).toEqual([
          null,
          expect.any(String),
          expect.any(String),
          expect.any(String),
        ]);
    });
    release();
    const summary = await run;
    expect(summary.lanes.solana).toMatchObject({ asked: 4, found: 4 });
    expect(ALCHEMY_CHAINS.map((chain) => summary.lanes[chain].found)).toEqual([4, 4, 4]);
  });

  it('sums each chain and each source for the end of the run', async () => {
    const summary = await discoverDates(undated(), { platform: 'xstocks' }, fakeDiscoverDeps({ rpc: chainRpc() }));

    expect(summary.lanes).toEqual({
      solana: { asked: 1, found: 1, nulls: {}, seconds: expect.any(Number) },
      ethereum: { asked: 1, found: 1, nulls: {}, seconds: expect.any(Number) },
    });
    expect(Object.keys(summary.sources).sort()).toEqual(['evmCode', 'solana']);
    expect(summary.sources.solana).toMatchObject({ calls: 1, failed: {} });
  });

  it("appends a market's listing as its next event, and a dry run names it without touching the file", async () => {
    const http = answering(() => ({ symbols: [{ symbol: 'TSLA', onboardDate: Date.parse('2025-07-01T08:00:00Z') }] }));
    const deps = fakeDiscoverDeps({ http });
    const xyz = baseTree()['perps/xyz/venue.json'] as object;
    const root = writeTree({ ...baseTree(), 'perps/xyz/venue.json': { ...xyz, adapter: 'binance' } });
    const before = readFileSync(join(root, MARKET), 'utf8');

    const dry = await discoverDates(root, { venue: 'xyz', dryRun: true }, deps);
    const untouched = readFileSync(join(root, MARKET), 'utf8');
    await discoverDates(root, { venue: 'xyz' }, deps);

    expect(dry.dated).toEqual([
      {
        file: MARKET,
        path: 'events[0]',
        date: '2025-07-01',
        source: expect.stringContaining('binance'),
        basis: 'listing-field',
      },
    ]);
    expect(untouched).toBe(before);
    expect(fileAt(root, MARKET).events).toEqual([
      { kind: 'listing', date: '2025-07-01', links: [expect.stringContaining('binance')] },
    ]);
  });
});
