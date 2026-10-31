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
import { flag, integer, optional, ref, slug, text } from './primitives';

// The kinds with a home of their own and the platform block, both published as platforms.
export const PLATFORM_KINDS: readonly string[] = ['platform', 'venue-operator'];

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
    onchainMcapBasis: optional(enums.mcapBasis),
    fees: optional(fees(v)),
    suspicious: optional(flag),
    delisted: optional(flag),
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
      'onchainMcapBasis',
      'fees',
    ],
    review: ['suspicious', 'delisted'],
  },
});
