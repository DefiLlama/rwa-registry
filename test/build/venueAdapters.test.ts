import { describe, expect, it } from 'vitest';
import { venueAdapters } from '../../src/build/venueAdapters';
import { baseTree, registryOf } from '../fixtures/tree';

const xyz = baseTree()['perps/xyz/venue.json'] as Record<string, unknown>;
const registryWith = (venues: Record<string, unknown>[]) =>
  registryOf({
    ...baseTree(),
    ...Object.fromEntries(venues.map((venue) => [`perps/${venue.slug}/venue.json`, venue])),
  });

describe('venueAdapters', () => {
  it('fails a published venue that names no adapter, its own or its parent', () => {
    const registry = registryWith([{ ...xyz, slug: 'flash', adapter: null }]);

    expect(venueAdapters(registry).map(({ file, error }) => [file, error])).toEqual([
      ['perps/flash/venue.json', 'VenueAdapterError'],
    ]);
  });

  it("passes an unpublished venue with no adapter and a HIP-3 dex read by its parent's adapter", () => {
    const registry = registryWith([
      { ...xyz, slug: 'flash', adapter: null, published: false },
      { ...xyz, slug: 'cash', adapter: null, parent: 'xyz' },
    ]);

    expect(venueAdapters(registry)).toEqual([]);
  });
});
