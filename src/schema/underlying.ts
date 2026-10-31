/**
 * underlying: one economic exposure that spot assets and perps markets share, in reference/underlyings/<class>/<slug>.json.
 * @dev review: src/schema/asset.ts
 */
import { z } from 'zod';
import { defineTable } from './defineTable';
import { identifier } from './identifier';
import { optional, slug, text, url } from './primitives';

export const underlying = defineTable({
  fields: (v) => ({
    slug: slug,
    name: text,
    ticker: optional(text),
    // The logo a market that tracks it shows.
    logo: optional(url),
    class: slug,
    exposure: v['asset-group'],
    identifiers: optional(z.array(identifier)),
    excludedReason: optional(text),
  }),
  implied: 'class',
  children: { roles: 'role', events: 'event' },
});
