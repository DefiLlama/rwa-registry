import { describe, expect, it } from 'vitest';
import { ackFile, assetFile, baseTree, load } from '../fixtures/tree';

describe('loadRegistry', () => {
  it('reads an asset file into asset, deployment, label and role rows, and a market venue from its folder', () => {
    const { registry, problems } = load(baseTree());

    expect(problems).toEqual([]);
    expect(registry.asset).toEqual([expect.objectContaining({ platform: 'xstocks', slug: 'tslax' })]);
    expect(registry.deployment.map((row) => [row.asset, row.chain, row.primary ?? null])).toEqual([
      ['tslax', 'solana', true],
      ['tslax', 'ethereum', null],
    ]);
    expect(registry.address_label).toEqual([
      expect.objectContaining({ deployment: 'solana:XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB' }),
    ]);
    expect(registry.role).toEqual([expect.objectContaining({ target: { table: 'asset', key: 'tslax' } })]);
    expect(registry.perp_market).toEqual([expect.objectContaining({ venue: 'xyz', symbol: 'TSLA' })]);
  });

  it("takes an underlying's class from its folder, and fails a folder that is no class or not its exposure's", () => {
    const { registry, problems } = load({
      ...baseTree(),
      'reference/underlyings/commodity/apple-inc.json': { slug: 'apple-inc', name: 'Apple Inc.', exposure: 'public-equities' },
      'reference/underlyings/stocks/nvidia-corporation.json': { slug: 'nvidia-corporation', name: 'NVIDIA Corporation', exposure: 'public-equities' },
    });

    expect(registry.underlying.map((row) => [row.slug, row.class])).toEqual([
      ['apple-inc', 'commodity'],
      ['tesla-inc', 'equity'],
      ['nvidia-corporation', 'stocks'],
    ]);
    expect(problems).toEqual([
      expect.objectContaining({
        file: 'reference/underlyings/commodity/apple-inc.json',
        error: 'UnderlyingClassError',
        message: 'exposure public-equities has class equity, so the file belongs in reference/underlyings/equity/',
      }),
      expect.objectContaining({
        file: 'reference/underlyings/stocks/nvidia-corporation.json',
        error: 'UnderlyingClassError',
        message: 'reference/underlyings/stocks/ is not a class an asset-group value names; the classes are equity, commodity',
      }),
    ]);
  });

  it('reads an ack from acks/<kind>/ with its kind from the folder, and refuses a flat ack', () => {
    const ack = ackFile();
    const { registry, problems } = load({
      ...baseTree(),
      'acks/flows-hidden/tslax.json': ack,
      'acks/tslax-flows.json': ack,
    });

    expect(registry.ack).toEqual([expect.objectContaining({ kind: 'flows-hidden', slug: 'tslax' })]);
    expect(problems).toEqual([expect.objectContaining({ file: 'acks/tslax-flows.json', error: 'UnknownPathError' })]);
  });

  it("takes an organization's kind from its home: a kind folder, an asset folder or a venue folder", () => {
    const { registry } = load(baseTree());

    expect(registry.organization.map((row) => [row.slug, row.kind])).toEqual([
      ['xstocks', 'platform'],
      ['trade-xyz', 'venue-operator'],
      ['backed-assets-je-limited', 'issuer'],
    ]);
  });

  it('needs a platform.json of kind platform in every asset folder, in one home only, one error each', () => {
    const { problems } = load({
      ...baseTree(),
      'assets/foo/foo-token.json': assetFile('foo-token', 9001),
      'reference/organizations/issuer/xstocks.json': { identity: { slug: 'xstocks', name: 'xStocks' } },
      'assets/bar/bar-token.json': assetFile('bar-token', 9002),
      'reference/organizations/issuer/bar.json': { identity: { slug: 'bar', name: 'Bar' } },
    });

    expect(problems.map((problem) => problem.error).sort()).toEqual([
      'DuplicateKeyError',
      'PlatformFolderError',
      'PlatformFolderError',
      'PlatformFolderError',
    ]);
  });
});
