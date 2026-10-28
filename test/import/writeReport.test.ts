import { describe, expect, it } from 'vitest';
import { unlistedChains } from '../../src/import/writeReport';
import { baseTree, registryOf, tslaxFile } from '../fixtures/tree';

describe('writeReport', () => {
  it('lists the chains in neither DefiLlama list nor the sdk with their labels and deployments', () => {
    const tslax = tslaxFile();
    const registry = registryOf({
      ...baseTree(),
      'reference/chains/boba-moonbeam.json': { slug: 'boba-moonbeam', label: 'Boba_moonbeam', addressFamily: 'evm' },
      'reference/chains/aonea-v-chain.json': { slug: 'aonea-v-chain', label: 'Aonea-V-Chain', addressFamily: 'evm' },
      'assets/xstocks/tslax.json': {
        ...tslax,
        deployments: [
          ...tslax.deployments,
          { chain: 'boba-moonbeam', address: `0x${'1'.repeat(40)}`, deployedAt: '2025-01-01' },
          { chain: 'boba-moonbeam', address: `0x${'2'.repeat(40)}`, deployedAt: '2025-01-01' },
        ],
      },
    });

    expect(unlistedChains(registry)).toEqual({
      topic: 'chains',
      line: expect.stringContaining(
        'aonea-v-chain (Aonea-V-Chain, 0 deployments), boba-moonbeam (Boba_moonbeam, 2 deployments)',
      ),
    });
  });
});
