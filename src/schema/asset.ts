/**
 * asset: one fungible token class across chains, written in assets/<platform>/<slug>.json as named blocks.
 * @dev review: src/schema/deployment.ts
 */
import { z } from 'zod';
import { defineTable } from './defineTable';
import * as enums from './enums';
import { identifier } from './identifier';
import { links } from './links';
import { flag, integer, number, optional, protocolId, ref, slug, text } from './primitives';

export const asset = defineTable({
  fields: (v) => ({
    platform: slug,
    slug: slug,
    symbol: text,
    name: text,
    legacyId: integer,
    canonicalMarketId: text,
    underlying: ref,
    instrument: optional(ref),
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
    minimumInvestment: optional(number),
    currency: optional(v['currency']),
    redemptionFrequency: optional(v['redemption-frequency']),
    valueModel: optional(v['value-model']),
    accessRegime: optional(v['access-regime']),
    attestationFrequency: optional(text),
    coingeckoId: optional(text),
    // The sheet's protocol ids of an asset with no issuer role to hold them; the build publishes them as issuerProtocolIds.
    protocolIds: optional(z.array(protocolId)),
    identifiers: optional(z.array(identifier)),
    // The sheet's ISIN cell as written where it holds more than its codes; the server published the cell.
    isinNote: optional(text),
    // The sheet's Llama Attestation Proof: the proof link, or false where the sheet marks none held ("x").
    llamaAttestationProof: optional(
      z.union([z.string().regex(/^https?:\/\/\S+$/, 'a proof is a link'), z.literal(false)]),
    ),
    description: optional(text),
    logo: optional(text),
    // The sheet's Issuer Registry Info of this asset; the server publishes it before the issuer organization's.
    registryInfo: optional(text),
    links: optional(links),
    activeAumReviewed: optional(flag),
    // The sheet's flags: a blank is left out, so the server publishes null. suspicious and delisted hold only the
    // sheet's FALSE, since a TRUE is the review or delisting event; llamaGradeAttestation holds either value.
    suspicious: optional(z.literal(false)),
    delisted: optional(z.literal(false)),
    llamaGradeAttestation: optional(flag),
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
    exposure: ['underlying', 'instrument', 'wraps'],
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
      'minimumInvestment',
      'currency',
      'redemptionFrequency',
      'valueModel',
      'accessRegime',
      'attestationFrequency',
    ],
    sources: ['coingeckoId', 'protocolIds', 'identifiers', 'isinNote', 'llamaAttestationProof'],
    about: ['description', 'logo', 'registryInfo', 'links'],
    review: ['activeAumReviewed', 'suspicious', 'delisted', 'llamaGradeAttestation'],
  },
});
