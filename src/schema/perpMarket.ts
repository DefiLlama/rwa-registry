/**
 * perpMarket: one market on one venue, written in perps/<venue>/<lowercase symbol>.json as named blocks.
 * @dev review: src/schema/venue.ts
 */
import { z } from 'zod';
import { defineTable } from './defineTable';
import * as enums from './enums';
import { flag, integer, number, optional, ref, text } from './primitives';

export const perpMarket = defineTable({
  fields: (v) => ({
    venue: ref,
    symbol: text,
    legacyId: optional(integer),
    aliases: optional(z.array(text)),
    tracks: optional(ref),
    tracksAsset: optional(ref),
    structure: v['asset-class'],
    // The asset the market margins and settles in, or the fx underlying of the fiat currency where no token does.
    collateral: optional(ref),
    pair: optional(text),
    makerFeeBps: optional(number),
    takerFeeBps: optional(number),
    description: optional(text),
    // The sheet's website and issuer where they differ from the venue's.
    website: optional(text),
    issuer: optional(text),
    suspicious: flag,
    delisted: flag,
    id: optional(text),
    status: optional(enums.status),
  }),
  implied: 'venue',
  build: ['id', 'status'],
  // Its roles hold an oracle only where it differs from the venue's oracle roles.
  children: { roles: 'role', events: 'event' },
  blocks: {
    identity: ['symbol', 'legacyId', 'aliases'],
    tracks: [['underlying', 'tracks'], ['asset', 'tracksAsset'], 'structure'],
    terms: ['collateral', 'pair', 'makerFeeBps', 'takerFeeBps'],
    about: ['description', 'website', 'issuer'],
    review: ['suspicious', 'delisted'],
  },
});
