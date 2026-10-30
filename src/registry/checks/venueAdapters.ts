/**
 * venueAdapters: a published venue names the server's venue adapter that reads it, its own or, for a HIP-3 dex, its parent's.
 * @dev review: src/registry/checks/index.ts
 */
import { VenueAdapterError } from '../../errors';
import type { Registry } from '../../schema';
import { report, type Problem } from '../problem';

export const venueAdapters = (registry: Registry): Problem[] => {
  const venues = new Map(registry.venue.map((venue) => [venue.slug, venue]));
  return registry.venue
    .filter((venue) => venue.published)
    .filter((venue) => !(venue.adapter ?? (venue.parent ? venues.get(venue.parent)?.adapter : null)))
    .map((venue) =>
      report(
        VenueAdapterError,
        'venue',
        venue,
        'adapter',
        `venue ${venue.slug} is published with no adapter; name one or set published to false`,
      ),
    );
};
