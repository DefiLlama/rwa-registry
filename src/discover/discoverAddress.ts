/**
 * discoverAddress: what the chain says of one address now (symbol, name, decimals, total supply, read as erc20 on EVM and Tron) and the day it was deployed, with the source.
 * @dev review: src/discover/readers/index.ts
 */
import { reasonOf } from '../errors/reasons';
import { NoSuchRowError } from '../errors/cli';
import { chainIdOf } from '../registry';
import type { Registry } from '../schema';
import type { DateResult } from './dateResult';
import type { DiscoverDeps } from './discoverDeps';
import { readDates } from './readers';

export type AddressFacts = {
  chain: string;
  address: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  totalSupply: number | null;
  deployedAt: string | null;
} & Omit<DateResult, 'date'> & { detail: string | null };

const ERC20 = new Set(['evm', 'tron']);
// The sdk has erc20 shortcuts for these three and none for name.
const ABIS = ['erc20:symbol', 'function name() view returns (string)', 'erc20:decimals', 'erc20:totalSupply'];

const unread = (deps: DiscoverDeps, what: string, reason: string) => {
  deps.log(`discover address: ${what} unread (${reason}), printed as null`);
  return null;
};

const erc20Reads = async (chainId: string, family: string, address: string, deps: DiscoverDeps) => {
  if (!ERC20.has(family)) {
    unread(deps, 'symbol, name, decimals and supply', `${family} is read as erc20 only on evm and tron`);
    return ABIS.map(() => null);
  }
  return Promise.all(
    ABIS.map((abi) =>
      deps.clients.rpc
        .evmCall({ chain: chainId, abi, calls: [{ target: address }] })
        .then(([value]) => value ?? unread(deps, abi, 'no value'))
        .catch((error: unknown) => unread(deps, abi, reasonOf(error))),
    ),
  );
};

// Raw supply without its decimals is not a supply, so it prints as null.
const supplyOf = (raw: string | null, decimals: number | null) =>
  raw !== null && decimals !== null ? Number(raw) / 10 ** decimals : null;

export const discoverAddress = async (registry: Registry, spec: string, deps: DiscoverDeps): Promise<AddressFacts> => {
  const colon = spec.indexOf(':');
  const slug = spec.slice(0, colon);
  const chain = registry.chain.find((row) => row.slug === slug);
  if (colon < 1 || !chain)
    throw new NoSuchRowError({
      file: spec,
      message: `no chain ${slug || spec} in the registry; write <chain>:<address>`,
    });
  const raw = spec.slice(colon + 1);
  const address = chain.addressFamily === 'evm' ? raw.toLowerCase() : raw;
  const chainId = chainIdOf(chain);
  const family = chain.addressFamily;
  const [[symbol, name, decimalsRaw, supplyRaw], [date]] = await Promise.all([
    erc20Reads(chainId, family, address, deps),
    readDates([{ chain: chain.slug, chainId, family, address }], deps),
  ]);
  const decimals = decimalsRaw === null ? null : Number(decimalsRaw);
  const { date: deployedAt, ...dated } = date;
  return {
    chain: chain.slug,
    address,
    symbol,
    name,
    decimals,
    totalSupply: supplyOf(supplyRaw, decimals),
    deployedAt,
    ...dated,
    detail: date.date === null ? date.detail : null,
  };
};
