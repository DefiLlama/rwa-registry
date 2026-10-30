/**
 * chains: a chain is the DefiLlama chain key where @defillama/sdk knows the chain, else the sheet's name, so nobody adds a chain here; familyOf names the address family the sdk's modules give the key, or null for a chain the sdk does not know, which validate warns on and nothing reads.
 * @dev review: src/registry/checks/unknownChains.ts, src/registry/checks/addressFormats.ts
 */
import { aptos, cosmos, icp, near, starknet, substrate, sui, svm, utxo } from '@defillama/sdk/build/chains';
import providers from '@defillama/sdk/build/providers.json';
import type { AddressFamily } from '../schema';

// The families of one chain each, keyed the way the sdk module names its chain.
const SINGLE: Record<string, AddressFamily> = {
  tron: 'tron',
  ripple: 'xrpl',
  stellar: 'stellar',
  ton: 'ton',
  [starknet.CHAIN]: 'starknet',
  algorand: 'algorand',
  [icp.CHAIN]: 'icp',
  [near.CHAIN]: 'near',
  tezos: 'tezos',
  cardano: 'cardano',
};

// The families a date reader exists for (src/discover/readers); a new deployment on any other family, or on a chain the
// sdk does not know, cannot be dated by anyone, so validate does not ask it for a date. A test keeps this list equal to
// the readers.
export const DATABLE_FAMILIES: ReadonlySet<AddressFamily> = new Set<AddressFamily>([
  'evm',
  'solana',
  'stellar',
  'xrpl',
  'tron',
  'aptos',
  'sui',
  'ton',
]);

export const isDatable = (chain: string): boolean => {
  const family = familyOf(chain);
  return family !== null && DATABLE_FAMILIES.has(family);
};

// The sdk's family modules come before its EVM provider list, which also holds tron (its own family) and hedera (an EVM relay, so evm here).
// The substrate list comes after it: astar and acala are on both, and a token contract there is an EVM address.
export const familyOf = (key: string): AddressFamily | null => {
  if (svm.isSvmChain(key)) return 'solana';
  if (cosmos.isCosmosChain(key)) return 'cosmos';
  if (aptos.isAptosChain(key)) return 'aptos';
  if (sui.suiChains.includes(key)) return 'sui';
  if (utxo.isUtxoChain(key)) return 'utxo';
  if (key in SINGLE) return SINGLE[key]!;
  if (key in providers) return 'evm';
  if (key in substrate.DEFAULT_ENDPOINTS) return 'substrate';
  return null;
};
