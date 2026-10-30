import { describe, expect, it } from 'vitest';
import { familyOf } from '../../src/registry';

describe('familyOf', () => {
  it.each([
    ['polkadot', 'substrate'],
    ['tron', 'tron'],
    ['ethereum', 'evm'],
    ['gnosis-chain', null],
  ])('names the family of %s from the sdk, its family modules before its EVM provider list', (key, family) => {
    expect(familyOf(key)).toBe(family);
  });
});
