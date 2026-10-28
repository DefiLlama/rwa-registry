/**
 * The fake chain reads discover asks: every read rejects as not faked unless a test gives it; failingRpc is the source every shared suite runs against.
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

const rejectingWith = (message: (method: string) => string): ChainReads =>
  Object.fromEntries(
    CHAIN_READS.map((method) => [method, vi.fn(async () => Promise.reject(new Error(message(method))))]),
  ) as unknown as ChainReads;

export const fakeRpc = (reads: Partial<ChainReads> = {}): ChainReads => ({
  ...rejectingWith((method) => `${method} is not faked`),
  ...reads,
});

export const failingRpc = (): ChainReads => rejectingWith(() => 'source down');
