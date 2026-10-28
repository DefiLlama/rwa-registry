/**
 * sdkChains: the chain keys the pinned @defillama/sdk serves, and the one a registry chain row maps to.
 * @dev review: src/import/applyCodeLists.ts
 */
import { chains as sdkModules, providerListJSON } from '@defillama/sdk';
import { CHAIN_SDK_KEYS } from './codeLists';

// The EVM, Tron and other providers, plus the modules that take a chain name (svm, cosmos, aptos, sui). A module
// that serves one chain and takes no name (xrpl, stellar, ton, icp, starknet, algorand) gives no key.
export const SDK_CHAIN_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(providerListJSON),
  ...Object.keys(sdkModules.svm.DEFAULT_ENDPOINTS),
  ...Object.keys(sdkModules.cosmos.DEFAULT_ENDPOINTS),
  ...sdkModules.cosmos.ibcChains,
  ...Object.keys(sdkModules.aptos.DEFAULT_ENDPOINTS),
  ...Object.keys(sdkModules.sui.DEFAULT_RPC_ENDPOINTS),
]);

// The code list first, then the slug, then each alias, each also with underscores for hyphens, as the sdk writes them.
export const sdkKeyOf = (
  chain: { slug: string; aliases?: string[] | null },
  keys: ReadonlySet<string> = SDK_CHAIN_KEYS,
): string | null => {
  const names = [chain.slug, ...(chain.aliases ?? [])].map((name) => name.trim().toLowerCase());
  const candidates = [CHAIN_SDK_KEYS[chain.slug], ...names.flatMap((name) => [name, name.replace(/-/g, '_')])];
  return candidates.find((name) => name != null && keys.has(name)) ?? null;
};
