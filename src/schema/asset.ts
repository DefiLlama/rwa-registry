/**
 * asset: one fungible token class across chains, written in assets/<platform>/<slug>.json as named blocks.
 * @dev review: src/schema/deployment.ts
 */
import { z } from 'zod';
import { defineTable } from './defineTable';
import * as enums from './enums';
import { identifier } from './identifier';
import { assetLinks } from './links';
import { flag, integer, optional, protocolId, ref, slug, text, url } from './primitives';

export const asset = defineTable({
  fields: (v) => ({
    platform: slug,
    slug: slug,
    symbol: text,
    name: text,
    legacyId: integer,
    canonicalMarketId: text,
    underlying: ref,
    wraps: optional(ref),
    structure: v['asset-class'],
    type: v['type'],
    rwaClassification: v['rwa-classification'],
    // The site's shelves it sits under, from the category vocabulary, first the main one.
    category: z.array(v['category']).min(1),
    // Today's published flag where the derived one differs, with the reason; the build publishes it over the derived value.
    stablecoinOverride: optional(flag),
    governanceOverride: optional(flag),
    flagReason: optional(text),
    redeemable: optional(flag),
    cexListed: optional(flag),
    kycForMintRedeem: optional(flag),
    kycToTransferHold: optional(flag),
    transferable: optional(flag),
    selfCustody: optional(flag),
    yieldBearing: optional(flag),
    attestationFrequency: optional(text),
    coingeckoId: optional(text),
    // The sheet's protocol ids of an asset with no issuer role to hold them; the build publishes them as issuerProtocolIds.
    protocolIds: optional(z.array(protocolId)),
    // The DefiLlama yields pool ids the server's native-yield match may use as an override.
    yieldPoolIds: optional(z.array(z.uuid())),
    identifiers: optional(z.array(identifier)),
    // The issuer's documents for this one asset, such as a property's deed or offering memorandum.
    documents: optional(z.array(url)),
    description: optional(text),
    logo: optional(text),
    links: optional(assetLinks),
    activeAumReviewed: optional(flag),
    // On an asset, market, venue and platform: set from the row's events on every write (src/registry/reviewFlags.ts).
    suspicious: flag,
    delisted: flag,
    primaryChain: ref,
    issuerProtocolIds: optional(z.array(protocolId)),
    kind: optional(enums.assetKind),
    stablecoin: optional(flag),
    governance: optional(flag),
    status: optional(enums.status),
    chains: optional(z.array(ref)),
  }),
  implied: 'platform',
  build: ['primaryChain', 'issuerProtocolIds', 'kind', 'stablecoin', 'governance', 'status', 'chains'],
  children: { deployments: 'deployment', roles: 'role', events: 'event' },
  blocks: {
    identity: ['slug', 'symbol', 'name', 'legacyId', 'canonicalMarketId'],
    exposure: ['underlying', 'wraps'],
    class: [
      'structure',
      'type',
      'rwaClassification',
      'category',
      ['stablecoin', 'stablecoinOverride'],
      ['governance', 'governanceOverride'],
      'flagReason',
    ],
    terms: [
      'redeemable',
      'cexListed',
      'kycForMintRedeem',
      'kycToTransferHold',
      'transferable',
      'selfCustody',
      'yieldBearing',
      'attestationFrequency',
    ],
    sources: ['coingeckoId', 'protocolIds', 'yieldPoolIds', 'identifiers', 'documents'],
    about: ['description', 'logo', 'links'],
    review: ['activeAumReviewed', 'suspicious', 'delisted'],
  },
});
