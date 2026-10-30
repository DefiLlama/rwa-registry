/**
 * organization: one firm or brand, of the kind its home names: a platform in its asset folder, a venue operator beside its venue, any other kind under reference/organizations/<kind>/.
 * @dev review: src/schema/fees.ts
 */
import { z } from 'zod';
import { defineTable } from './defineTable';
import * as enums from './enums';
import { fees } from './fees';
import { identifier } from './identifier';
import { links } from './links';
import { integer, optional, ref, slug, text } from './primitives';

// The blocks only some kinds hold; identity, about and identifiers are every organization's.
export const KIND_BLOCKS: Record<string, readonly string[]> = { platform: ['platform', 'venue-operator'] };

export const organization = defineTable({
  fields: (v) => ({
    kind: v['organization-kind'],
    slug: slug,
    name: text,
    parent: optional(ref),
    legacyPid: optional(integer),
    protocolSlug: optional(text),
    description: optional(text),
    logo: optional(text),
    links: optional(links),
    registryInfo: optional(text),
    foundedYear: optional(integer),
    headquarters: optional(text),
    founders: optional(text),
    regulatoryStatus: optional(text),
    keyMilestones: optional(text),
    entityStructureNotes: optional(text),
    identifiers: optional(z.array(identifier)),
    category: optional(z.array(v['category'])),
    platformType: optional(z.array(v['asset-class'])),
    accessModel: optional(v['access-model']),
    primaryChain: optional(ref),
    chains: optional(z.array(ref)),
    attestationFrequency: optional(text),
    // The sheet's flags: a blank is left out, so the server publishes null. suspicious and delisted hold only the
    // sheet's FALSE, since a TRUE is the review or delisting event.
    suspicious: optional(z.literal(false)),
    delisted: optional(z.literal(false)),
    onchainMcapBasis: optional(enums.mcapBasis),
    fees: optional(fees(v)),
    status: optional(enums.status),
  }),
  implied: 'kind',
  build: ['status'],
  children: { roles: 'role', events: 'event' },
  blocks: {
    identity: ['slug', 'name', 'parent', 'legacyPid', 'protocolSlug'],
    about: [
      'description',
      'logo',
      'links',
      'registryInfo',
      'foundedYear',
      'headquarters',
      'founders',
      'regulatoryStatus',
      'keyMilestones',
      'entityStructureNotes',
    ],
    platform: [
      'category',
      'platformType',
      'accessModel',
      'primaryChain',
      'chains',
      'attestationFrequency',
      'suspicious',
      'delisted',
      'onchainMcapBasis',
      'fees',
    ],
  },
});
