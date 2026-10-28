/**
 * normalizeAddress: one chain:address item of Contracts or of the holders column as its registry key, or the reason it cannot be one.
 * @dev review: src/registry/addressFamilies.ts
 */
import { ADDRESS_PATTERNS, xrplToken } from '../registry/addressFamilies';
import type { AddressFamily } from '../schema';
import { CHAIN_MERGES } from './codeLists';

export type ChainContext = 'contract' | 'chain';
export interface ChainSpelling {
  slug: string;
  family: AddressFamily | null;
  spelling: string;
}
export type Normalized = { chain: string; family: AddressFamily; address: string } | { reason: string };

const FAMILY: Record<string, AddressFamily | null> = {
  solana: 'solana',
  stellar: 'stellar',
  ripple: 'xrpl',
  xrpl: 'xrpl',
  aptos: 'aptos',
  sui: 'sui',
  icp: 'icp',
  tron: 'tron',
  ton: 'ton',
  starknet: 'starknet',
  hedera: 'hedera',
  algorand: 'algorand',
  injective: null,
  ...Object.fromEntries(
    'osmosis agoric archway aura carbon chihuahua comdex crescent elys juno kujira neutron persistence regen stargaze umee xpla secret ibc noble provenance axelar sifchain iris'
      .split(' ')
      .map((chain) => [chain, 'cosmos' as const]),
  ),
  ...Object.fromEntries(
    'near eos stacks tezos waves zilliqa icon liquid eti canton kadena cardano bitcoin polkadot flow mina radix multiversx'
      .split(' ')
      .map((chain) => [chain, null]),
  ),
};
const NOT_A_CHAIN = new Set(['http', 'https', 'real', 'cex', 'apex-omni']);

// The export's chain aliases; hyperliquid names HyperEVM only in contract and holder items, HyperCore elsewhere.
const ALIASES: Record<string, string> = { plume_mainnet: 'plume' };
const CONTRACT_ALIASES: Record<string, string> = { ...ALIASES, hyperliquid: 'hyperevm' };

// A merged spelling lands on the row that keeps the sdk's chain key, so one chain is one row in every context.
export const chainOf = (spelling: string, context: ChainContext): ChainSpelling | null => {
  const lower = spelling.trim().toLowerCase();
  if (lower === '' || NOT_A_CHAIN.has(lower)) return null;
  const written = (context === 'contract' ? CONTRACT_ALIASES : ALIASES)[lower] ?? lower.replace(/[^a-z0-9]+/g, '-');
  const slug = CHAIN_MERGES[written] ?? written;
  return { slug, family: lower in FAMILY ? FAMILY[lower] : 'evm', spelling: spelling.trim() };
};

const moveKey = (address: string): string => {
  const [hex, ...tag] = address.split('::');
  const digits = hex.replace(/^0x/i, '').toLowerCase();
  return [`0x${digits.padStart(64, '0')}`, ...tag].join('::');
};

const KEY_FORM: Record<AddressFamily, (address: string) => string | null> = {
  evm: (address) => (/^0x[0-9a-fA-F]{40}$/.test(address) ? address.toLowerCase() : null),
  stellar: (address) => address.replace(/^([A-Za-z0-9]{1,12})[:-](G[A-Z2-7]{55})(-1)?$/, '$1-$2'),
  // The item as the sheet writes it, which is the string the server publishes and its XRPL reader takes.
  xrpl: (address) => (xrplToken(address) ? address : null),
  aptos: moveKey,
  sui: moveKey,
  starknet: moveKey,
  solana: (address) => address,
  tron: (address) => address,
  ton: (address) => address,
  cosmos: (address) => address,
  icp: (address) => address,
  hedera: (address) => address,
  algorand: (address) => address,
};

// A holder is an account, not a token: a Stellar G account or a bare XRPL account is its key as written.
const HOLDER_FORM: Partial<Record<AddressFamily, (address: string) => string | null>> = {
  evm: KEY_FORM.evm,
  aptos: moveKey,
  sui: moveKey,
  starknet: moveKey,
};

export const normalizeHolder = (item: string): Normalized => {
  const at = item.indexOf(':');
  const chain = at < 0 ? null : chainOf(item.slice(0, at), 'contract');
  if (!chain?.family) return normalizeAddress(item);
  const address = item.slice(at + 1);
  const key = (HOLDER_FORM[chain.family] ?? ((written: string) => written))(address);
  return key && /^\S+$/.test(key)
    ? { chain: chain.slug, family: chain.family, address: key }
    : { reason: `not a valid ${chain.family} account: ${address}` };
};

export const normalizeAddress = (item: string): Normalized => {
  if (item.trim() === '') return { reason: 'empty item' };
  const at = item.indexOf(':');
  if (at < 0) return { reason: `no chain prefix: ${item}` };
  const chain = chainOf(item.slice(0, at), 'contract');
  const address = item.slice(at + 1).trim();
  if (!chain) return { reason: `${item.slice(0, at)} is not a chain` };
  if (!chain.family) return { reason: `chain ${chain.spelling} has no address family the registry can key` };
  const key = KEY_FORM[chain.family](address);
  if (key == null || !ADDRESS_PATTERNS[chain.family].test(key)) {
    return { reason: `not a valid ${chain.family} address: ${address}` };
  }
  return { chain: chain.slug, family: chain.family, address: key };
};
