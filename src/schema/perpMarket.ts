/**
 * perpMarket: one market on one venue, written in perps/<venue>/<lowercase symbol>.json as named blocks.
 * @dev review: src/schema/venue.ts
 */
import { z } from 'zod';
import { defineTable } from './defineTable';
import * as enums from './enums';
import { integer, number, optional, ref, text } from './primitives';

export const perpMarket = defineTable({
  fields: (v) => ({
    venue: ref,
    symbol: text,
    // The sheet's Name where the venue's name, the tracked name and "Perp" do not spell it.
    name: optional(text),
    legacyId: optional(integer),
    aliases: optional(z.array(text)),
    tracks: optional(ref),
    tracksAsset: optional(ref),
    structure: v['asset-class'],
    collateral: optional(ref),
    // The sheet's margin asset as written ("USDC (Arbitrum)") where it differs from the venue's.
    marginAsset: optional(text),
    pair: optional(text),
    makerFeeBps: optional(number),
    takerFeeBps: optional(number),
    session: optional(enums.sessionModel),
    oracleProvider: optional(text),
    description: optional(text),
    // The sheet's Logo of the market row, which no venue or underlying holds.
    logo: optional(text),
    refLinks: optional(z.array(text)),
    // The sheet's website and issuer where they differ from the venue's.
    website: optional(text),
    issuer: optional(text),
    id: optional(text),
    status: optional(enums.status),
  }),
  implied: 'venue',
  build: ['id', 'status'],
  children: { events: 'event' },
  blocks: {
    identity: ['symbol', 'name', 'legacyId', 'aliases'],
    tracks: [['underlying', 'tracks'], ['asset', 'tracksAsset'], 'structure'],
    terms: ['collateral', 'marginAsset', 'pair', 'makerFeeBps', 'takerFeeBps', 'session'],
    sources: ['oracleProvider'],
    about: ['description', 'logo', 'refLinks', 'website', 'issuer'],
  },
});
