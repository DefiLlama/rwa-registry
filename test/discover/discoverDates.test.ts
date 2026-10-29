import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { discoverDates } from '../../src/discover/discoverDates';
import { readPatches } from '../../src/utils/patchCsv';
import { RateLimitedError } from '../../src/errors';
import { assetFile, baseTree, registryOf, undatedTslax } from '../fixtures/tree';
import type { HttpRequest } from '../../src/clients/http';
import { evmNode } from './readers/jsonRpc';
import { answering, discoverConfig, fakeDiscoverDeps } from '../fakes/discover';
import type { DiscoverDeps } from '../../src/discover/discoverDeps';
import { fakeRpc } from '../fakes/rpc';

const undated = () => registryOf({ ...baseTree(), 'assets/xstocks/tslax.json': undatedTslax() });

const outFile = () => join(mkdtempSync(join(tmpdir(), 'rwa-discover-')), 'dates.csv');

const chainRpc = () =>
  fakeRpc({
    evmHead: vi.fn(async () => 100),
    evmHasCode: vi.fn(async ({ block }: { block: number }) => block >= 37),
    evmBlockTime: vi.fn(async () => 1751241600),
    solanaSignatures: vi.fn(async () => [{ signature: 'sig0', slot: 5, blockTime: 1751328000 }]),
  });

describe('discoverDates', () => {
  it("writes one deployedAt patch row per undated deployment, with its source and today's fetchedAt", async () => {
    const out = outFile();
    await discoverDates(undated(), { out, platform: 'xstocks' }, fakeDiscoverDeps({ rpc: chainRpc() }));

    expect(readPatches(out)).toEqual([
      expect.objectContaining({
        file: 'assets/xstocks/tslax.json',
        path: 'deployments[0].deployedAt',
        old: '',
        new: '2025-07-01',
        source: 'https://explorer.solana.com/tx/sig0',
        fetchedAt: '2026-10-25',
      }),
      expect.objectContaining({ path: 'deployments[1].deployedAt', new: '2025-06-30' }),
    ]);
  });

  it('writes the first stored day for a deployment no reader dates, and none for two that share a chain leg', async () => {
    const tree: Record<string, unknown> = { ...baseTree() };
    tree['reference/chains/hedera.json'] = { slug: 'hedera', label: 'Hedera', addressFamily: 'hedera' };
    tree['reference/chains/algorand.json'] = { slug: 'algorand', label: 'Algorand', addressFamily: 'algorand' };
    tree['assets/xstocks/hist.json'] = assetFile('hist', 950, {
      deployments: [
        { chain: 'hedera', address: '0.0.1', deployedAt: null, primary: true },
        { chain: 'algorand', address: 'ALGO1', deployedAt: null },
        { chain: 'algorand', address: 'ALGO2', deployedAt: '2024-01-01' },
      ],
    });
    const out = outFile();
    const http = answering(() => [
      { timestamp: 1714521600, chains: { hedera: { totalSupply: 2 }, algorand: { totalSupply: 2 } } },
    ]);
    const deps = fakeDiscoverDeps({ http }, discoverConfig({ PRO_API_KEY: 'prokey' }));
    const summary = await discoverDates(registryOf(tree), { out, platform: 'xstocks' }, deps);

    expect(readPatches(out)).toEqual([
      expect.objectContaining({
        file: 'assets/xstocks/hist.json',
        path: 'deployments[0].deployedAt',
        new: '2024-05-01',
        source: 'https://pro-api.llama.fi/<key>/rwa/chart/asset/950',
        agent: 'discover dates (first-stored-day)',
      }),
    ]);
    expect(summary.lanes.algorand).toMatchObject({ asked: 1, found: 0, nulls: { 'no-reader': 1 } });
  });

  it('skips the rows the patch file holds, so a rerun asks only for the rest', async () => {
    const out = outFile();
    const rpc = chainRpc();
    await discoverDates(undated(), { out, platform: 'xstocks', limit: 1 }, fakeDiscoverDeps({ rpc }));
    await discoverDates(undated(), { out, platform: 'xstocks' }, fakeDiscoverDeps({ rpc }));

    expect(readPatches(out).map(({ path }) => path)).toEqual([
      'deployments[0].deployedAt',
      'deployments[1].deployedAt',
    ]);
    expect(vi.mocked(rpc.solanaSignatures)).toHaveBeenCalledTimes(1);
  });

  it('leaves a rate-limited read out of the file as null with its reason, so a resume asks again', async () => {
    const out = outFile();
    const rpc = fakeRpc({
      evmHead: vi.fn(async () =>
        Promise.reject(new RateLimitedError({ source: 'rpc', reason: 'rate-limited', message: '429' })),
      ),
      solanaSignatures: vi.fn(async () => [{ signature: 'sig0', slot: 5, blockTime: 1751328000 }]),
    });
    const summary = await discoverDates(undated(), { out, platform: 'xstocks' }, fakeDiscoverDeps({ rpc }));

    expect(readPatches(out).map(({ path }) => path)).toEqual(['deployments[0].deployedAt']);
    expect(summary.nulls).toEqual({ 'rate-limited': { count: 1, fate: 'asked again', detail: 'rpc: 429' } });
  });

  it('writes a capped Solana read as a cursor row, and the next run resumes from that cursor', async () => {
    const out = outFile();
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
    await discoverDates(undated(), { out, platform: 'xstocks' }, deps());
    await discoverDates(undated(), { out, platform: 'xstocks' }, deps());

    const rows = readPatches(out).filter(({ path }) => path === 'deployments[0].deployedAt');
    expect(rows.map(({ new: value, agent }) => [value, agent])).toEqual([
      ['unknown', 'discover dates (resume before sig2)'],
      ['2025-06-27', 'discover dates (first-signature)'],
    ]);
  });

  it("writes a fast chain's rows while a slow chain is still reading, since each chain is its own lane", async () => {
    const out = outFile();
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const solanaSignatures = vi.fn(async () => {
      await gate;
      return [{ signature: 'sig0', slot: 5, blockTime: 1751328000 }];
    });
    const run = discoverDates(
      undated(),
      { out, platform: 'xstocks' },
      fakeDiscoverDeps({ rpc: { ...chainRpc(), solanaSignatures } }),
    );

    await vi.waitFor(() =>
      expect(existsSync(out) && readPatches(out).map(({ path }) => path)).toEqual(['deployments[1].deployedAt']),
    );
    release();
    await run;
    expect(readPatches(out).map(({ path }) => path)).toEqual([
      'deployments[1].deployedAt',
      'deployments[0].deployedAt',
    ]);
  });

  it("keeps the Alchemy EVM lanes moving while Solana's pages on the same key hang, with rate limits mixed in", async () => {
    // Three EVM chains on the Alchemy key and Solana, four deployments each, the way the full fill meets them.
    const ALCHEMY_CHAINS = ['bsc', 'base', 'ink'];
    const tree: Record<string, unknown> = { ...baseTree() };
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
    const out = outFile();
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
    const run = discoverDates(registryOf(tree), { out, platform: 'xstocks' }, fakeDiscoverDeps({ http }, keyed));

    await vi.waitFor(() => {
      const chains = new Set(readPatches(out).map(({ source }) => source.split(' ')[1]));
      expect(chains).toEqual(new Set(ALCHEMY_CHAINS));
    });
    release();
    const summary = await run;
    expect(summary.lanes.solana).toMatchObject({ asked: 4, found: 4 });
    expect(ALCHEMY_CHAINS.map((chain) => summary.lanes[chain].found)).toEqual([4, 4, 4]);
  });

  it('sums each chain and each source for the end of the run', async () => {
    const summary = await discoverDates(
      undated(),
      { out: outFile(), platform: 'xstocks' },
      fakeDiscoverDeps({ rpc: chainRpc() }),
    );

    expect(summary.lanes).toEqual({
      solana: { asked: 1, found: 1, nulls: {}, seconds: expect.any(Number) },
      ethereum: { asked: 1, found: 1, nulls: {}, seconds: expect.any(Number) },
    });
    expect(Object.keys(summary.sources).sort()).toEqual(['evmCode', 'solana']);
    expect(summary.sources.solana).toMatchObject({ calls: 1, failed: {} });
  });

  it("adds a market's listing as an event row and writes nothing on --dry-run", async () => {
    const out = outFile();
    const http = answering(() => ({ symbols: [{ symbol: 'TSLA', onboardDate: Date.parse('2025-07-01T08:00:00Z') }] }));
    const deps = fakeDiscoverDeps({ http });
    const xyz = baseTree()['perps/xyz/venue.json'] as object;
    const onBinance = registryOf({ ...baseTree(), 'perps/xyz/venue.json': { ...xyz, adapter: 'binance' } });
    const dry = await discoverDates(onBinance, { out, venue: 'xyz', dryRun: true }, deps);
    const wroteDry = existsSync(out);
    await discoverDates(onBinance, { out, venue: 'xyz' }, deps);

    expect([dry.rows.length, wroteDry]).toEqual([1, false]);
    const [row] = readPatches(out);
    expect(row).toMatchObject({ file: 'perps/xyz/tsla.json', path: 'events[0]', old: '' });
    expect(JSON.parse(row.new)).toMatchObject({ kind: 'listing', date: '2025-07-01' });
    expect(readFileSync(out, 'utf8').split('\n')[0]).toBe('file,path,old,new,source,fetchedAt,agent,verified');
  });
});
