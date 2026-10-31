import { describe, expect, it } from 'vitest';
import { registryJson } from '../../src/build/registryJson';
import { checkRegistry, type Problem } from '../../src/registry';
import { deriveFields } from '../../src/registry/deriveFields';
import { baseTree, load, marketWith, registryOf, tslaxWith, xstocksPlatform, xyzVenue } from '../fixtures/tree';

const errorsIn = (problems: Problem[]) => problems.filter((problem) => problem.severity === 'error');
const delisting = { kind: 'delisting', date: '2026-10-20', reason: 'test', links: ['https://x.example/d'] };
const suspiciousReview = { kind: 'review', date: '2026-10-20', outcome: 'suspicious', reason: 'test' };

describe('review flags', () => {
  it('fails a delisted flag the latest listing or delisting event does not say', () => {
    const problems = checkRegistry(
      registryOf({
        ...baseTree(),
        'perps/xyz/tsla.json': marketWith({ delisted: true }),
        'assets/xstocks/tslax.json': tslaxWith({ events: [delisting] }),
      }),
    );

    expect(problems).toEqual([
      expect.objectContaining({ error: 'ReviewFlagError', file: 'assets/xstocks/tslax.json', path: 'review.delisted' }),
      expect.objectContaining({ error: 'ReviewFlagError', file: 'perps/xyz/tsla.json', path: 'review.delisted' }),
    ]);
  });

  it('fails a suspicious flag the latest review event does not say', () => {
    const cleared = { ...suspiciousReview, date: '2026-10-25', outcome: 'cleared', reason: null };
    const problems = checkRegistry(
      registryOf({
        ...baseTree(),
        'assets/xstocks/tslax.json': tslaxWith({ events: [suspiciousReview] }),
        'perps/xyz/tsla.json': marketWith({ suspicious: true, events: [suspiciousReview, cleared] }),
      }),
    );

    expect(problems).toEqual([
      expect.objectContaining({ error: 'ReviewFlagError', file: 'assets/xstocks/tslax.json', path: 'review.suspicious' }),
      expect.objectContaining({ error: 'ReviewFlagError', file: 'perps/xyz/tsla.json', path: 'review.suspicious' }),
    ]);
  });

  it('takes a review on a venue and a listing on a platform, the flags following them', () => {
    const relisting = { kind: 'listing', date: '2026-10-25', links: ['https://x.example/l'] };
    const problems = checkRegistry(
      registryOf({
        ...baseTree(),
        'perps/xyz/venue.json': { ...xyzVenue(), review: { suspicious: true, delisted: false }, events: [suspiciousReview] },
        'assets/xstocks/platform.json': { ...xstocksPlatform(), events: [delisting, relisting] },
      }),
    );

    expect(problems).toEqual([]);
  });

  it('fails a listing, delisting or review event dated after the day it is checked at', () => {
    const later = { ...delisting, date: '2026-10-26' };
    const registry = registryOf({ ...baseTree(), 'perps/xyz/tsla.json': marketWith({ delisted: true, events: [later] }) });

    expect(checkRegistry(registry, '2026-10-26')).toEqual([]);
    expect(checkRegistry(registry, '2026-10-25')).toEqual([
      expect.objectContaining({ error: 'FutureEventError', file: 'perps/xyz/tsla.json', path: 'events[0].date' }),
    ]);
  });

  it('keeps a retired market delisted false when no delisting event says otherwise', () => {
    const retired = { kind: 'retirement', date: '2026-10-20', reason: 'test' };

    expect(checkRegistry(registryOf({ ...baseTree(), 'perps/xyz/tsla.json': marketWith({ events: [retired] }) }))).toEqual(
      [],
    );
  });

  it('fails a platform without its flags and an issuer that holds them', () => {
    const problems = checkRegistry(
      registryOf({
        ...baseTree(),
        'assets/xstocks/platform.json': { identity: xstocksPlatform().identity, platform: { primaryChain: 'solana' } },
        'reference/organizations/issuer/backed-assets-je-limited.json': {
          identity: { slug: 'backed-assets-je-limited', name: 'Backed Assets (JE) Limited' },
          review: { suspicious: false, delisted: false },
        },
      }),
    );

    expect(problems.map(({ error, file, path }) => [error, file, path])).toEqual([
      ['OrganizationKindError', 'reference/organizations/issuer/backed-assets-je-limited.json', 'review.suspicious'],
      ['OrganizationKindError', 'reference/organizations/issuer/backed-assets-je-limited.json', 'review.delisted'],
      ['ReviewFlagError', 'assets/xstocks/platform.json', 'review.suspicious'],
      ['ReviewFlagError', 'assets/xstocks/platform.json', 'review.delisted'],
    ]);
  });

  it('fails an asset, market or venue file without its flags, once, at the schema', () => {
    const { review: _, ...venue } = xyzVenue();
    const { problems } = load({ ...baseTree(), 'perps/xyz/venue.json': venue });

    expect(errorsIn(problems).map(({ error, file, path }) => [error, file, path])).toEqual([
      ['SchemaError', 'perps/xyz/venue.json', 'review'],
    ]);
  });

  it('builds every flagged row with both flags', () => {
    const built = JSON.parse(
      registryJson(
        deriveFields(
          registryOf({ ...baseTree(), 'perps/xyz/tsla.json': marketWith({ delisted: true, events: [delisting] }) }),
          '2026-10-25',
        ),
        'abc',
      ),
    ).tables;
    const flagsOf = (rows: Record<string, unknown>[]) => rows.map(({ suspicious, delisted }) => ({ suspicious, delisted }));

    expect(flagsOf(built.asset)).toEqual([{ suspicious: false, delisted: false }]);
    expect(flagsOf(built.perp_market)).toEqual([{ suspicious: false, delisted: true }]);
    expect(built.perp_market[0].status).toBe('delisted');
    expect(flagsOf(built.venue)).toEqual([{ suspicious: false, delisted: false }]);
    expect(Object.fromEntries(built.organization.map((row: { slug: string }) => [row.slug, flagsOf([row])[0]]))).toEqual({
      xstocks: { suspicious: false, delisted: false },
      'trade-xyz': { suspicious: false, delisted: false },
      'backed-assets-je-limited': { suspicious: undefined, delisted: undefined },
    });
  });
});
