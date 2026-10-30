/**
 * The fake chain reads discover asks, each rejecting unless a test fakes it, and fakeChain, the one fake EVM chain.
 * @dev review: src/discover/discoverDeps.ts
 */
import { vi } from 'vitest';
import type { DiscoverClients } from '../../src/discover/discoverDeps';

export type ChainReads = DiscoverClients['rpc'];

const CHAIN_READS = [
  'evmCall',
  'evmHead',
  'evmHasCode',
  'evmBlockTime',
  'solanaSignatures',
  'solanaOwner',
] as const satisfies readonly (keyof ChainReads)[];

export const fakeRpc = (reads: Partial<ChainReads> = {}): ChainReads => ({
  ...(Object.fromEntries(
    CHAIN_READS.map((method) => [method, vi.fn(async () => Promise.reject(new Error(`${method} is not faked`)))]),
  ) as unknown as ChainReads),
  ...reads,
});

// Head 100, code from block first, and one block a day with block 37 on 2025-06-30.
export const fakeChain = (first = 37, reads: Partial<ChainReads> = {}): ChainReads =>
  fakeRpc({
    evmHead: vi.fn(async () => 100),
    evmHasCode: vi.fn(async ({ block }: { block: number }) => block >= first),
    evmBlockTime: vi.fn(async (_chain: string, block: number) => 1751241600 + (block - 37) * 86_400),
    ...reads,
  });
