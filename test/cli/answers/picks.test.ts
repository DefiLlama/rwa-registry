import { describe, expect, it } from 'vitest';
import { chain, reference, referenceOf, vocabulary } from '../../../src/cli/answers/picks';
import { baseTree, registryOf, tslaxWith } from '../../fixtures/tree';

const organizations = Object.fromEntries(
  Array.from({ length: 60 }, (_, i) => [
    `reference/organizations/issuer/firm-${i}.json`,
    { identity: { slug: `firm-${i}`, name: `Firm ${i}` } },
  ]),
);
const registry = registryOf({
  ...baseTree(),
  ...organizations,
  'assets/xstocks/tslax.json': tslaxWith({
    deployments: [{ chain: 'not-in-the-sdk', address: 'x', deployedAt: '2025-06-30', primary: true }],
  }),
});
const context = { registry, values: {} };

describe('pick answers', () => {
  it('a short list refuses a slug outside it by naming every value', () => {
    expect(vocabulary('category').read('stocks-equity', context)).toEqual({
      refused: 'not stocks-equities or rwa-perps',
    });
  });

  it('a reference offers every row of its table, however many, by name', () => {
    const choices = reference('organization').choices!(context)!;

    expect(choices).toHaveLength(63);
    expect(choices[0]).toEqual({ value: 'backed-assets-je-limited', name: 'Backed Assets (JE) Limited' });
    expect(reference('organization').read('unrelated-name', context)).toEqual({
      refused: 'no organization unrelated-name in the registry; add it first with add organization',
    });
  });

  it('a reference named by its field offers the rows validate lets it name', () => {
    const collateral = referenceOf('perp_market', 'collateral').choices!(context)!;

    expect(collateral.map((choice) => (typeof choice === 'string' ? choice : choice.value))).toEqual(['tslax']);
  });

  it('a chain accepts an sdk chain, a chain the registry holds and a new name, and refuses a misspelling', () => {
    expect(chain.read('ethereum', context)).toEqual({ value: 'ethereum' });
    expect(chain.read('not-in-the-sdk', context)).toHaveProperty('value');
    expect(chain.read('canton', context)).toEqual({ value: 'canton' });
    expect(chain.read('solanna', context)).toEqual({
      refused: 'not a chain the sdk or the registry knows; did you mean solana',
    });
    expect(chain.read('Canton Network', context)).toHaveProperty('refused');
  });
});
