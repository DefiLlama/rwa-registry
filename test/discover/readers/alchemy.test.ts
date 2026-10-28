import { describe, expect, it, vi } from 'vitest';
import type { HttpRequest } from '../../../src/clients/http';
import type { DateQuery } from '../../../src/discover/dateReader';
import { alchemyUrl } from '../../../src/discover/readers/alchemy';
import { evm } from '../../../src/discover/readers/evm';
import { solana } from '../../../src/discover/readers/solana';
import { answering, discoverConfig, fakeDiscoverDeps } from '../../fakes/discover';
import { fakeRpc } from '../../fakes/rpc';
import { evmNode } from './jsonRpc';

const ADDRESS = '0x6604b5da093f3f35066c6c79e51d581a44c35288';
const evmQuery = (chain: string): DateQuery => ({ chain, chainId: chain, family: 'evm', address: ADDRESS });
const keyed = discoverConfig({ ALCHEMY_KEY: 'test-key' });

const publicCode = (first: number) =>
  fakeRpc({
    evmHead: vi.fn(async () => 100),
    evmHasCode: vi.fn(async ({ block }: { block: number }) => block >= first),
    evmBlockTime: vi.fn(async (_chain: string, block: number) => 1751241600 + block * 86_400),
  });

describe('alchemy node', () => {
  it("builds a chain's URL from the ALCHEMY_KEY placeholder and its subdomain, and none without either", () => {
    const deps = fakeDiscoverDeps({}, keyed);

    expect(alchemyUrl(deps, 'arbitrum')).toBe('https://arb-mainnet.g.alchemy.com/v2/test-key');
    expect(alchemyUrl(deps, 'solana')).toBe('https://solana-mainnet.g.alchemy.com/v2/test-key');
    expect(alchemyUrl(deps, 'plume')).toBeNull();
    expect(alchemyUrl(fakeDiscoverDeps(), 'arbitrum')).toBeNull();
  });

  it('runs the code search on the Alchemy node of a chain it serves, with a source that holds no key', async () => {
    const http = evmNode(37);
    const rpc = publicCode(37);
    const [result] = await evm.read([evmQuery('base')], fakeDiscoverDeps({ http, rpc }, keyed));
    const urls = vi.mocked(http.json).mock.calls.map(([request]: [HttpRequest]) => request.url);

    expect(result).toMatchObject({ date: '2025-08-06', block: 37, basis: 'first-code' });
    expect(result.source).toContain('alchemy');
    expect(result.source).not.toContain('test-key');
    expect(new Set(urls)).toEqual(new Set(['https://base-mainnet.g.alchemy.com/v2/test-key']));
    expect(vi.mocked(rpc.evmHasCode)).not.toHaveBeenCalled();
  });

  it('falls back to the public node for a chain with no subdomain, or when the key is missing', async () => {
    const http = evmNode(37);
    const [unserved] = await evm.read([evmQuery('cronos')], fakeDiscoverDeps({ http, rpc: publicCode(37) }, keyed));
    const [unkeyed] = await evm.read([evmQuery('base')], fakeDiscoverDeps({ http, rpc: publicCode(37) }));

    expect(unserved).toMatchObject({ block: 37, basis: 'first-code', source: expect.not.stringContaining('alchemy') });
    expect(unkeyed).toMatchObject({ block: 37, basis: 'first-code' });
    expect(vi.mocked(http.json)).not.toHaveBeenCalled();
  });

  it("reads a node's JSON-RPC error as null with the node's message, never a date", async () => {
    const http = answering(() => ({ error: { code: -32000, message: 'missing trie node' } }));
    const [result] = await evm.read([evmQuery('arbitrum')], fakeDiscoverDeps({ http }, keyed));

    expect(result).toMatchObject({ date: null, detail: expect.stringContaining('missing trie node') });
  });

  it('pages Solana signatures on the Alchemy node when the key is set', async () => {
    // A mint of five signatures, sig0 the newest, answered two a page from the cursor.
    const http = answering(({ body }: HttpRequest) => {
      const before = ((body as { params: unknown[] }).params[1] as { before?: string }).before;
      const start = before ? Number(before.slice(3)) + 1 : 0;
      const result = [start, start + 1]
        .filter((index) => index < 5)
        .map((index) => ({ signature: `sig${index}`, slot: 1000 - index, blockTime: 1751241600 - index }));
      return { result };
    });
    const rpc = fakeRpc({ solanaSignatures: vi.fn(async () => []) });
    const config = {
      ...keyed,
      sources: { ...keyed.sources, solana: { ...keyed.sources.solana, pageSize: 2, pagesPerRun: 5 } },
    };
    const query: DateQuery = { chain: 'solana', chainId: 'solana', family: 'solana', address: 'Mint111' };
    const [result] = await solana.read([query], fakeDiscoverDeps({ http, rpc }, config));

    expect(result).toMatchObject({ block: 996, basis: 'first-signature' });
    expect(vi.mocked(http.json)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(rpc.solanaSignatures)).not.toHaveBeenCalled();
  });

  it("starts the code search at a chain's first served block and gives no day for code already there", async () => {
    const floor = {
      ...keyed,
      sources: { ...keyed.sources, evmCode: { ...keyed.sources.evmCode, firstBlocks: { arbitrum: 40 } } },
    };
    const [after] = await evm.read([evmQuery('arbitrum')], fakeDiscoverDeps({ http: evmNode(70) }, floor));
    const [before] = await evm.read([evmQuery('arbitrum')], fakeDiscoverDeps({ http: evmNode(37) }, floor));

    expect(after).toMatchObject({ block: 70, basis: 'first-code' });
    expect(before).toMatchObject({ date: null, reason: 'history-truncated' });
  });
});
