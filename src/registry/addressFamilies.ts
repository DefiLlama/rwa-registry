/**
 * addressFamilies: per address family that has one, the key form of a token address and the form of a holder account; a family absent here is not checked.
 * @dev review: src/registry/checks/addressFormats.ts
 */
import type { AddressFamily } from '../schema';

const BECH32 = '[a-z]+1[02-9ac-hj-np-z]{38,58}';
const BASE58 = '[1-9A-HJ-NP-Za-km-z]';
const ICP = /^[a-z0-9]{5}(-[a-z0-9]{5}){3,9}(-[a-z0-9]{1,5})?$/;

export const ADDRESS_PATTERNS: Partial<Record<AddressFamily, RegExp>> = {
  evm: /^0x[0-9a-f]{40}$/,
  solana: new RegExp(`^${BASE58}{32,44}$`),
  tron: new RegExp(`^T${BASE58}{33}$`),
  ton: /^(EQ|UQ)[A-Za-z0-9_-]{46}$/,
  stellar: /^([A-Za-z0-9]{1,12}-G[A-Z2-7]{55}|C[A-Z2-7]{55})$/,
  // An XRPL token as the sheet writes it: a code, one of . : - and the issuer, or a bare issuer for all its codes.
  xrpl: new RegExp(`^(([A-Za-z0-9]{3}|[0-9A-Fa-f]{40}|[\\x21-\\x7e]{4,20})[.:-])?r${BASE58}{24,34}$`),
  aptos: /^0x[0-9a-f]{64}(::[A-Za-z0-9_]+::[A-Za-z0-9_]+)?$/,
  sui: /^0x[0-9a-f]{64}::[A-Za-z0-9_]+::[A-Za-z0-9_]+$/,
  starknet: /^0x[0-9a-f]{64}$/,
  // A bank denom as the Cosmos SDK allows it (bare, factory/... or ibc/<hash>), or a bech32 contract.
  cosmos: new RegExp(`^(${BECH32}|[a-zA-Z][a-zA-Z0-9/:._-]{2,127})$`),
  icp: ICP,
  algorand: /^\d+$/,
};

// A Stellar holder may be a G account or a C contract, since contracts hold balances too.
export const ACCOUNT_PATTERNS: Partial<Record<AddressFamily, RegExp>> = {
  evm: /^0x[0-9a-f]{40}$/,
  solana: new RegExp(`^${BASE58}{32,44}$`),
  tron: new RegExp(`^T${BASE58}{33}$`),
  ton: /^(EQ|UQ)[A-Za-z0-9_-]{46}$/,
  stellar: /^[GC][A-Z2-7]{55}$/,
  xrpl: new RegExp(`^r${BASE58}{24,34}$`),
  aptos: /^0x[0-9a-f]{64}$/,
  sui: /^0x[0-9a-f]{64}$/,
  starknet: /^0x[0-9a-f]{64}$/,
  cosmos: new RegExp(`^${BECH32}$`),
  icp: ICP,
  algorand: /^[A-Z2-7]{58}$/,
};

const XRPL_TOKEN = new RegExp(`^(?:(.+?)[.:-])?(r${BASE58}{24,34})$`);

// An XRPL token address as its issuer and its currency as the ledger holds it: a three-character code as written, a
// longer code as its ASCII bytes in 40 hex digits, and null for a bare issuer, which stands for all its codes.
export const xrplToken = (address: string): { currency: string | null; issuer: string } | null => {
  const match = XRPL_TOKEN.exec(address);
  if (!match) return null;
  const [, code, issuer] = match;
  if (code === undefined) return { currency: null, issuer };
  if (/^[A-Za-z0-9]{3}$/.test(code)) return { currency: code, issuer };
  if (/^[0-9A-Fa-f]{40}$/.test(code)) return { currency: code.toUpperCase(), issuer };
  if (/^[\x21-\x7e]{4,20}$/.test(code))
    return { currency: Buffer.from(code).toString('hex').toUpperCase().padEnd(40, '0'), issuer };
  return null;
};
