/**
 * underlying: one economic exposure that spot assets and perps markets share, with the asset group it is (what a stablecoin's backing is), written in reference/underlyings/<class>/<slug>.json, where the class is the one its exposure's asset-group value names.
 * @dev review: src/schema/asset.ts
 */
import { z } from 'zod';
import { defineTable } from './defineTable';
import { identifier } from './identifier';
import { optional, slug, text } from './primitives';

export const underlying = defineTable({
  fields: (v) => ({
    slug: slug,
    name: text,
    aliases: optional(z.array(text)),
    ticker: optional(text),
    class: slug,
    exposure: v['asset-group'],
    identifiers: optional(z.array(identifier)),
    unit: optional(text),
    currency: optional(v['currency']),
    excludedReason: optional(text),
  }),
  implied: 'class',
  children: { roles: 'role', events: 'event' },
});
