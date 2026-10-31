import { describe, expect, it } from 'vitest';
import { address } from '../../../src/cli/answers/address';
import { baseTree, registryOf } from '../../fixtures/tree';

const registry = registryOf(baseTree());
const on = (chain: string) => ({ registry, values: { chain } });

describe('the address answer', () => {
  it('reads an EVM address in mixed case as its lowercase key', () => {
    expect(address.read('0x8AD3c73F833d3F9A523aB01476625F269aEB7Cf0', on('ethereum'))).toEqual({
      value: '0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0',
    });
  });

  it('refuses an EVM address on Solana', () => {
    expect(address.read('0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0', on('solana'))).toEqual({
      refused: 'not a token address for solana',
    });
  });

  it('accepts any text on a chain whose family has no address form', () => {
    expect(address.read('anything', on('near'))).toEqual({ value: 'anything' });
  });
});
