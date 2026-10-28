/**
 * chainNames: a chain name as the alias check compares it, and a chain row's DefiLlama chain id.
 * @dev review: src/registry/checks/chainAliases.ts
 */
import type { Row } from '../schema';

// A DefiLlama chain id written with an underscore (polygon_zkevm, boba_bnb), which a slug cannot hold.
const LLAMA_CHAIN_ID = /^[a-z0-9]+_[a-z0-9_]+$/;

export const nameKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '');

// The DefiLlama chain id is the sdk's key for the chain, else its underscored alias, else its slug. A merged alias
// such as avalanche on avax is never the id, so the id stays the one the sdk serves.
export const chainIdOf = (chain: Pick<Row<'chain'>, 'slug' | 'aliases' | 'sdkKey'>): string =>
  chain.sdkKey ?? chain.aliases?.find((alias) => LLAMA_CHAIN_ID.test(alias)) ?? chain.slug;
