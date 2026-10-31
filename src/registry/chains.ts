/**
 * chains: the address family @defillama/sdk gives a chain key, or null for a chain it does not know, and every chain key it knows.
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

// The order is the rule: the sdk's family modules, then its EVM providers (tron is in both), then substrate, where astar's contracts are EVM.
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

// Every key one of the sdk's family modules or its EVM providers names, sorted.
export const sdkChains = (): string[] =>
  [
    ...new Set([
      ...svm.svmChains,
      ...Object.keys(cosmos.DEFAULT_ENDPOINTS),
      ...aptos.aptosChains,
      ...sui.suiChains,
      ...utxo.utxoChains,
      ...Object.keys(SINGLE),
      ...Object.keys(providers),
      ...Object.keys(substrate.DEFAULT_ENDPOINTS),
    ]),
  ]
    .filter((key) => familyOf(key) !== null)
    .sort();
