import { describe, expect, it } from 'vitest';
import { identifier, protocolId } from '../../../src/cli/answers/ids';
import { baseTree, registryOf } from '../../fixtures/tree';

const context = { registry: registryOf(baseTree()), values: {} };

describe('id answers', () => {
  it('an ISIN is read as its scheme and value and refused with a wrong check digit', () => {
    expect(identifier.read('isin:US88160R1014', context)).toEqual({ value: { scheme: 'isin', value: 'US88160R1014' } });
    expect(identifier.read('isin:US88160R1015', context)).toEqual({ refused: 'not a valid ISIN' });
  });

  it('an LEI is refused with a wrong check digit', () => {
    expect(identifier.read('lei:549300EQW4J4RXDLD359', context)).toHaveProperty('value');
    expect(identifier.read('lei:549300EQW4J4RXDLD358', context)).toEqual({ refused: 'not a valid LEI' });
  });

  it('an identifier refuses a scheme the schema does not know', () => {
    expect(identifier.read('cusip:88160R101', context)).toHaveProperty('refused');
  });

  it('a protocol id reads a number and refuses a slug', () => {
    expect(protocolId.read('2525', context)).toEqual({ value: 2525 });
    expect(protocolId.read('ondo', context)).toHaveProperty('refused');
  });
});
