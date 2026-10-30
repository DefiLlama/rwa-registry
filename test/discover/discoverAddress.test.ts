import { describe, expect, it, vi } from 'vitest';
import { discoverAddress } from '../../src/discover/discoverAddress';
import { fakeDiscoverDeps } from '../fakes/discover';
import { fakeChain, fakeRpc } from '../fakes/rpc';

describe('discoverAddress', () => {
  it('reads what the chain says of an address: symbol, name, decimals, supply now and the deployment date', async () => {
    const answers: Record<string, string> = {
      'erc20:symbol': 'TSLAx',
      'function name() view returns (string)': 'Tesla xStock',
      'erc20:decimals': '18',
      'erc20:totalSupply': '45000000000000000000000',
    };
    const rpc = fakeChain(37, { evmCall: vi.fn(async ({ abi, calls }) => calls.map(() => answers[abi])) });
    const facts = await discoverAddress(
      'ethereum:0x8AD3C73F833D3F9A523AB01476625F269AEB7CF0',
      fakeDiscoverDeps({ rpc }),
    );

    expect(facts).toMatchObject({
      chain: 'ethereum',
      address: '0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0',
      symbol: 'TSLAx',
      name: 'Tesla xStock',
      decimals: 18,
      totalSupply: 45000,
      deployedAt: '2025-06-30',
      block: 37,
      basis: 'first-code',
    });
  });

  it('refuses a chain key the sdk does not know', async () => {
    await expect(discoverAddress('nochain:0x1', fakeDiscoverDeps())).rejects.toThrow(
      'nochain is not a DefiLlama chain',
    );
  });

  it('answers the erc20 facts of a non-EVM address as null, and says so once', async () => {
    const log = vi.fn();
    const rpc = fakeRpc({
      solanaSignatures: vi.fn(async () => [{ signature: 'sig0', slot: 5, blockTime: 1751328000 }]),
    });
    const facts = await discoverAddress('solana:XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', {
      ...fakeDiscoverDeps({ rpc }),
      log,
    });

    expect(facts).toMatchObject({ symbol: null, decimals: null, totalSupply: null, deployedAt: '2025-07-01' });
    expect(log).toHaveBeenCalledTimes(1);
  });
});
