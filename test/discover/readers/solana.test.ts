import { describe, expect, it, vi } from 'vitest';
import type { HttpRequest } from '../../../src/clients/http';
import { HttpStatusError } from '../../../src/errors';
import { answering, discoverConfig, fakeDiscoverDeps } from '../../fakes/discover';
import { fakeRpc } from '../../fakes/rpc';
import type { DateQuery } from '../../../src/discover/dateReader';
import { solana } from '../../../src/discover/readers/solana';
import { METADATA_PROGRAM, metadataAddress } from '../../../src/discover/readers/solanaAddress';
import { shouldBehaveLikeDateReader } from '../../behaviours/shouldBehaveLikeDateReader';

const MINT = 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB';
const query: DateQuery = { chain: 'solana', chainId: 'solana', family: 'solana', address: MINT };
const config = (pagesPerRun: number) => {
  const discover = discoverConfig();
  return {
    ...discover,
    sources: { ...discover.sources, solana: { ...discover.sources.solana, pageSize: 2, pagesPerRun } },
  };
};
const signature = (index: number) => ({ signature: `sig${index}`, slot: 1000 - index, blockTime: 1751241600 - index });

// The mint's signatures, sig0 the newest; the mint's metadata account has none unless metadata gives them.
// owner: the program that owns the metadata account, null when no account lives there.
const pages = (
  count: number,
  metadata: { signature: string; slot: number; blockTime: number }[] = [],
  owner: string | null = metadata.length ? METADATA_PROGRAM : null,
) =>
  fakeRpc({
    solanaOwner: vi.fn(async ({ address }: { address: string }) => (address === metadataAddress(MINT) ? owner : null)),
    solanaSignatures: vi.fn(async ({ address, before }: { address: string; before: string | null }) => {
      if (address === metadataAddress(MINT)) return metadata;
      const start = before ? Number(before.slice(3)) + 1 : 0;
      return [0, 1]
        .map((offset) => start + offset)
        .filter((index) => index < count)
        .map(signature);
    }),
  });

describe('solana date reader', () => {
  shouldBehaveLikeDateReader(solana, [query, { ...query, address: 'So11111111111111111111111111111111111111112' }]);

  it('pages to the end and dates the oldest signature', async () => {
    const rpc = pages(5);
    const [result] = await solana.read([query], fakeDiscoverDeps({ rpc }, config(5)));

    expect(vi.mocked(rpc.solanaSignatures)).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      date: '2025-06-29',
      block: 996,
      source: 'https://explorer.solana.com/tx/sig4',
      basis: 'first-signature',
    });
  });

  it('dates the oldest signature of a full last page when the page after it is empty', async () => {
    const [result] = await solana.read([query], fakeDiscoverDeps({ rpc: pages(4) }, config(5)));

    expect(result).toMatchObject({ block: 997, basis: 'first-signature' });
  });

  it('stops at the pages of one run with a cursor, from which the next run reaches the oldest signature', async () => {
    const rpc = pages(5);
    const [capped] = await solana.read([query], fakeDiscoverDeps({ rpc }, config(2)));
    const [resumed] = await solana.read(
      [{ ...query, before: capped.reason === 'page-cap' ? capped.cursor : null }],
      fakeDiscoverDeps({ rpc }, config(2)),
    );

    expect(capped).toMatchObject({ date: null, reason: 'page-cap', cursor: 'sig2' });
    expect(resumed).toMatchObject({ block: 996, basis: 'first-signature' });
  });

  describe('with SOLSCAN_API_KEY', () => {
    const keyed = () => {
      const discover = config(5);
      const solscan = discoverConfig({ SOLSCAN_API_KEY: 'solkey' }).sources.solscan;
      return { ...discover, sources: { ...discover.sources, solscan } };
    };

    it("dates a mint at Solscan's created_time in one call, before any signature page, with the key in the header", async () => {
      const rpc = pages(5);
      const http = answering(() => ({ success: true, data: { created_time: 1751241600 } }));
      const [result] = await solana.read([{ ...query, before: 'sig9' }], fakeDiscoverDeps({ rpc, http }, keyed()));

      expect(result).toMatchObject({
        date: '2025-06-30',
        block: null,
        source: `https://solscan.io/token/${MINT}`,
        basis: 'created-time',
      });
      expect(vi.mocked(rpc.solanaSignatures)).not.toHaveBeenCalled();
      const [request] = vi.mocked(http.json).mock.calls[0] as [HttpRequest];
      expect(request).toMatchObject({
        url: 'https://pro-api.solscan.io/v2.0/token/meta',
        query: { address: MINT },
        headers: { token: 'solkey' },
      });
    });

    it('walks the signatures when Solscan gives no time or fails', async () => {
      const http = answering(({ query: asked }) =>
        asked?.address === MINT ? { success: true, data: {} } : Promise.reject(new Error('solscan down')),
      );
      const results = await solana.read(
        [query, { ...query, address: 'Other1111111111111111111111111111111111111' }],
        fakeDiscoverDeps({ rpc: pages(5), http }, keyed()),
      );

      expect(results.map(({ basis }) => basis)).toEqual(['first-signature', 'first-signature']);
    });

    it('asks Solscan no more in the run once it refuses the key', async () => {
      const http = answering(() =>
        Promise.reject(new HttpStatusError({ source: 'solscan', reason: 'http-error', message: 'HTTP 401' })),
      );
      const deps = fakeDiscoverDeps({ rpc: pages(5), http }, keyed());
      await solana.read([query], deps);
      const [second] = await solana.read([query], deps);

      expect(vi.mocked(http.json)).toHaveBeenCalledTimes(1);
      expect(second).toMatchObject({ basis: 'first-signature' });
    });
  });

  it('never asks Solscan without the key', async () => {
    const http = answering(() => ({ success: true, data: { created_time: 1751241600 } }));
    const [result] = await solana.read([query], fakeDiscoverDeps({ rpc: pages(5), http }, config(5)));

    expect(vi.mocked(http.json)).not.toHaveBeenCalled();
    expect(result).toMatchObject({ basis: 'first-signature' });
  });

  describe('with PRO_API_KEY', () => {
    const asset = { legacyId: 89, deploymentsOnChain: 1 };
    const keyed = () => {
      const discover = config(5);
      const history = discoverConfig({ PRO_API_KEY: 'prokey' }).sources.history;
      return { ...discover, sources: { ...discover.sources, history } };
    };
    const chart = (chains: Record<string, { totalSupply: number }>) =>
      answering(() => [{ timestamp: 1699401600, chains }]);

    it('dates a mint that holds a cursor at its first stored day, when it has no metadata account, before any page of the mint', async () => {
      const rpc = pages(5);
      const http = chart({ solana: { totalSupply: 1 } });
      const [result] = await solana.read(
        [{ ...query, asset, before: 'sig1' }],
        fakeDiscoverDeps({ rpc, http }, keyed()),
      );
      const asked = vi.mocked(rpc.solanaSignatures).mock.calls.map(([call]) => call.address);

      expect(result).toMatchObject({
        date: '2023-11-08',
        source: 'https://pro-api.llama.fi/<key>/rwa/chart/asset/89',
        basis: 'first-stored-day',
      });
      expect(asked).toEqual([]);
    });

    it('resumes the walk of a mint with a cursor when the chart holds no Solana leg', async () => {
      const rpc = pages(5);
      const http = chart({ ethereum: { totalSupply: 1 } });
      const [result] = await solana.read(
        [{ ...query, asset, before: 'sig1' }],
        fakeDiscoverDeps({ rpc, http }, keyed()),
      );

      expect(result).toMatchObject({ block: 996, basis: 'first-signature' });
    });

    it('walks a mint with no cursor first and never asks the chart', async () => {
      const http = chart({ solana: { totalSupply: 1 } });
      const [result] = await solana.read([{ ...query, asset }], fakeDiscoverDeps({ rpc: pages(5), http }, keyed()));

      expect(result).toMatchObject({ block: 996, basis: 'first-signature' });
      expect(vi.mocked(http.json)).not.toHaveBeenCalled();
    });
  });

  describe('the metadata account', () => {
    const created = [{ signature: 'meta0', slot: 7, blockTime: 1719792000 }];

    it('dates a mint that holds a cursor by its metadata account, with no page of the mint read', async () => {
      const rpc = pages(5, created);
      const [result] = await solana.read([{ ...query, before: 'sig1' }], fakeDiscoverDeps({ rpc }, config(5)));

      expect(result).toMatchObject({
        date: '2024-07-01',
        block: 7,
        source: 'https://explorer.solana.com/tx/meta0',
        basis: 'metadata-created',
      });
      expect(vi.mocked(rpc.solanaSignatures)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(rpc.solanaSignatures).mock.calls[0]![0].address).toBe(metadataAddress(MINT));
    });

    it('never dates by a metadata address that holds no account, though transactions that name it leave signatures', async () => {
      const rpc = pages(5, created, null);
      const [result] = await solana.read([query], fakeDiscoverDeps({ rpc }, config(2)));

      expect(result).toMatchObject({ date: null, reason: 'page-cap', cursor: 'sig2' });
      expect(vi.mocked(rpc.solanaSignatures).mock.calls.map(([call]) => call.address)).not.toContain(
        metadataAddress(MINT),
      );
    });

    it('dates a mint that outruns its pages by its metadata account instead of answering page-cap', async () => {
      const [result] = await solana.read([query], fakeDiscoverDeps({ rpc: pages(5, created) }, config(2)));

      expect(result).toMatchObject({ date: '2024-07-01', basis: 'metadata-created' });
    });

    it('never asks the metadata account of a mint whose walk ends', async () => {
      const rpc = pages(5, created);
      const [result] = await solana.read([query], fakeDiscoverDeps({ rpc }, config(5)));

      expect(result).toMatchObject({ basis: 'first-signature' });
      expect(vi.mocked(rpc.solanaSignatures).mock.calls.map(([call]) => call.address)).not.toContain(
        metadataAddress(MINT),
      );
    });
  });
});
