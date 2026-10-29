import { describe, expect, it } from 'vitest';
import { familyOf } from '../../src/registry';

describe('familyOf', () => {
  it.each([
    ['solana', 'solana'],
    ['osmosis', 'cosmos'],
    ['aptos', 'aptos'],
    ['sui', 'sui'],
    ['bitcoin', 'utxo'],
    ['polkadot', 'substrate'],
    ['tron', 'tron'],
    ['ripple', 'xrpl'],
    ['stellar', 'stellar'],
    ['ton', 'ton'],
    ['starknet', 'starknet'],
    ['algorand', 'algorand'],
    ['icp', 'icp'],
    ['near', 'near'],
    ['tezos', 'tezos'],
    ['cardano', 'cardano'],
    ['ethereum', 'evm'],
    ['hedera', 'evm'],
    ['gnosis-chain', null],
  ])('names the family of %s from the sdk, its family modules before its EVM provider list', (key, family) => {
    expect(familyOf(key)).toBe(family);
  });
});
