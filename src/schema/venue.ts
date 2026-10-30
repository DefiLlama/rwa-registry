/**
 * venue: one exchange, perp protocol or HIP-3 dex, written in perps/<venue>/venue.json.
 * @dev review: src/schema/perpMarket.ts
 */
import { defineTable } from './defineTable';
import * as enums from './enums';
import { flag, number, optional, ref, slug, text } from './primitives';

export const venue = defineTable({
  fields: (v) => ({
    slug: slug,
    organization: ref,
    parent: optional(ref),
    venueType: v['venue-type'],
    chain: optional(ref),
    adapter: optional(text),
    published: flag,
    makerFeeBps: optional(number),
    takerFeeBps: optional(number),
    deployerFeeShare: optional(number),
    fundingRetentionPct: optional(number),
    accessModel: v['access-model'],
    rwaClassification: v['rwa-classification'],
    conventionNote: optional(text),
    status: optional(enums.status),
  }),
  build: ['status'],
  children: { roles: 'role', events: 'event' },
});
