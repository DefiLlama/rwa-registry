import { describe, expect, it } from 'vitest';
import { leavesOf } from '../../src/cli/schemaAnswers';
import { baseTree, registryOf } from '../fixtures/tree';

const context = { registry: registryOf(baseTree()), values: {} };
const answerAt = (field: string, path = [field]) =>
  leavesOf('organization', field).find((leaf) => leaf.path.join('.') === path.join('.'))!.answer;

describe('the answer each schema field takes', () => {
  it('a reference is a pick of the rows validate lets it name', () => {
    expect(answerAt('parent').choices!(context)).toContainEqual({
      value: 'backed-assets-je-limited',
      name: 'Backed Assets (JE) Limited',
    });
  });

  it('a list of chains is a pick many of the chains', () => {
    const chains = answerAt('chains');

    expect(chains.many).toBe(true);
    expect(chains.read('etherium', context)).toHaveProperty('refused');
  });

  it('a link nested in a block takes the link answer', () => {
    expect(answerAt('links', ['links', 'docs']).read('d', context)).toHaveProperty('refused');
  });

  it('a fee in basis points is zero or more, and a Pct field a percent', () => {
    expect(answerAt('fees', ['fees', 'mintFeeBps']).read('-1', context)).toHaveProperty('refused');
    expect(answerAt('fees', ['fees', 'performanceFeePct']).read('120', context)).toHaveProperty('refused');
  });
});
