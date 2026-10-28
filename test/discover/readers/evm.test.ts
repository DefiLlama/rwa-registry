import { describe, expect, it, vi } from 'vitest';
import type { HttpRequest } from '../../../src/clients/http';
import type { DateQuery } from '../../../src/discover/dateReader';
import { evm } from '../../../src/discover/readers/evm';
import { shouldBehaveLikeDateReader } from '../../behaviours/shouldBehaveLikeDateReader';
import { answering, discoverConfig, fakeDiscoverDeps } from '../../fakes/discover';
import { fakeRpc } from '../../fakes/rpc';
import { RateLimitedError, TimeoutError } from '../../../src/errors';
import { evmNode } from './jsonRpc';

const ETH = '0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0';
const query = (chain: string, address = ETH): DateQuery => ({ chain, chainId: chain, family: 'evm', address });
const keyed = discoverConfig({ ETHERSCAN_API_KEY: 'test-key' });
const created = (address: string, timestamp: string) => ({
  contractAddress: address,
  blockNumber: '22800000',
  timestamp,
});

const codeFrom = (first: number) =>
  fakeRpc({
    evmHead: vi.fn(async () => 100),
    evmHasCode: vi.fn(async ({ block }: { block: number }) => block >= first),
    evmBlockTime: vi.fn(async (_chain: string, block: number) => 1751241600 + block * 86_400),
  });

describe('evm date reader', () => {
  shouldBehaveLikeDateReader(evm, [query('ethereum'), query('ink')]);

  it('dates five addresses of a covered chain in one Etherscan call, with a source that holds no key', async () => {
    const addresses = Array.from({ length: 6 }, (_, index) => `0x${String(index).repeat(40)}`);
    const http = answering(({ query: params }: HttpRequest) => ({
      status: '1',
      message: 'OK',
      result: String(params?.contractaddresses)
        .split(',')
        .map((address) => created(address, '1751241600')),
    }));
    const results = await evm.read(
      addresses.map((address) => query('ethereum', address)),
      fakeDiscoverDeps({ http }, keyed),
    );

    expect(vi.mocked(http.json)).toHaveBeenCalledTimes(2);
    expect(results[5]).toMatchObject({ date: '2025-06-30', block: 22800000, basis: 'contract-creation' });
    expect(results[0].source).not.toContain('test-key');
  });

  it('finds the first block with code by binary search when there is no key, or the chain is not covered', async () => {
    const rpc = codeFrom(37);
    const http = answering(() => ({
      status: '0',
      message: 'NOTOK',
      result: 'Free API access is not supported for this chain',
    }));
    const [unkeyed] = await evm.read([query('ethereum')], fakeDiscoverDeps({ rpc }));
    const [uncovered] = await evm.read([query('ethereum')], fakeDiscoverDeps({ rpc, http }, keyed));

    expect(unkeyed).toMatchObject({ date: '2025-08-06', block: 37, basis: 'first-code' });
    expect(uncovered).toMatchObject({ block: 37, basis: 'first-code' });
  });

  it('reads a rate-limit answer as rate-limited and never searches the code instead', async () => {
    const rpc = codeFrom(37);
    const http = answering(() => ({
      status: '0',
      message: 'NOTOK',
      result: 'Max calls per sec rate limit reached (5/sec)',
    }));
    const [result] = await evm.read([query('ethereum')], fakeDiscoverDeps({ rpc, http }, keyed));

    expect(result).toMatchObject({ date: null, reason: 'rate-limited' });
    expect(vi.mocked(rpc.evmHasCode)).not.toHaveBeenCalled();
  });

  it('answers no-code for an address with no code at the head', async () => {
    const [result] = await evm.read([query('ink')], fakeDiscoverDeps({ rpc: codeFrom(101) }));

    expect(result).toMatchObject({ date: null, reason: 'no-code' });
  });

  it('names a timed-out code search code-search-timeout, with the read that timed out', async () => {
    const timedOut = new TimeoutError({
      source: 'rpc',
      reason: 'timeout',
      message: 'ink getCode: no answer within 60000 ms',
    });
    const rpc = fakeRpc({ evmHead: vi.fn(async () => Promise.reject(timedOut)) });
    const [result] = await evm.read([query('ink')], fakeDiscoverDeps({ rpc }));

    expect(result).toMatchObject({
      date: null,
      reason: 'code-search-timeout',
      detail: 'rpc: ink getCode: no answer within 60000 ms',
    });
  });

  it('asks Etherscan once for a chain it refuses and names the refusal once per run, not once per batch', async () => {
    const http = answering(() => ({ status: '0', message: 'NOTOK', result: 'Free API access is not supported' }));
    const deps = { ...fakeDiscoverDeps({ rpc: codeFrom(37), http }, keyed), log: vi.fn() };
    const addresses = Array.from({ length: 12 }, (_, index) => `0x${String(index % 10).repeat(39)}${index}`);
    await evm.read(
      addresses.slice(0, 6).map((address) => query('arbitrum', address)),
      deps,
    );
    await evm.read(
      addresses.slice(6).map((address) => query('arbitrum', address)),
      deps,
    );
    const refusals = deps.log.mock.calls.filter((call) => String(call[0]).startsWith('etherscan refused'));

    expect(vi.mocked(http.json)).toHaveBeenCalledTimes(1);
    expect(refusals).toHaveLength(1);
  });
});

describe('evm date reader on a Blockscout explorer', () => {
  const ROBINHOOD = 'https://robinhoodchain.blockscout.com';
  const explorerOnly = (request: HttpRequest) => request.url.startsWith(ROBINHOOD);

  it("dates a chain's addresses from its explorer's contract-creation route, five a call, with no key", async () => {
    const addresses = Array.from({ length: 6 }, (_, index) => `0x${String(index).repeat(40)}`);
    const http = answering((request) => ({
      status: '1',
      message: 'OK',
      result: String(request.query?.contractaddresses)
        .split(',')
        .filter((address) => address !== addresses[5])
        .map((address) => created(address, '1751241600')),
    }));
    const results = await evm.read(
      addresses.map((address) => query('robinhood', address)),
      fakeDiscoverDeps({ http }),
    );
    const calls = vi.mocked(http.json).mock.calls.map(([request]) => request);

    expect(calls.every(explorerOnly)).toBe(true);
    expect(calls[0]).toMatchObject({ url: `${ROBINHOOD}/api`, query: { action: 'getcontractcreation' } });
    expect(calls).toHaveLength(2);
    expect(results[0]).toMatchObject({ date: '2025-06-30', basis: 'contract-creation' });
    expect(results[0].source).toContain(ROBINHOOD);
    expect(results[5]).toMatchObject({ date: null, reason: 'not-found' });
  });

  it('names an explorer that refuses once per run and sends the chain to the code search on its Alchemy node', async () => {
    const node = evmNode(37);
    const http = answering((request) =>
      explorerOnly(request) ? Promise.reject(new Error('unreachable')) : node.json(request),
    );
    const alchemy = discoverConfig({ ALCHEMY_KEY: 'test-key' });
    const deps = { ...fakeDiscoverDeps({ http }, alchemy), log: vi.fn() };
    const addresses = Array.from({ length: 6 }, (_, index) => `0x${String(index).repeat(40)}`);
    const results = await evm.read(
      addresses.map((address) => query('robinhood', address)),
      deps,
    );
    const asked = vi.mocked(http.json).mock.calls.filter(([request]) => explorerOnly(request));

    expect(asked).toHaveLength(1);
    expect(deps.log.mock.calls.filter((call) => String(call[0]).includes('robinhoodchain'))).toHaveLength(1);
    expect(results[5]).toMatchObject({ block: 37, basis: 'first-code' });
  });

  it('answers a rate-limited explorer with null rate-limited and never searches the code instead', async () => {
    const limited = new RateLimitedError({ source: 'blockscout', reason: 'rate-limited', message: 'HTTP 429' });
    const http = answering(() => Promise.reject(limited));
    const rpc = codeFrom(37);
    const [result] = await evm.read([query('robinhood')], fakeDiscoverDeps({ http, rpc }));

    expect(result).toMatchObject({ date: null, reason: 'rate-limited' });
    expect(vi.mocked(rpc.evmHasCode)).not.toHaveBeenCalled();
  });
});
