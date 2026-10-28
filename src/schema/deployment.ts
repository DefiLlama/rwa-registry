/**
 * deployment: one asset at one address on one chain, nested in its asset file; the one marked primary names the asset's primary chain.
 * @dev review: src/schema/addressLabel.ts
 */
import { z } from 'zod';
import { defineTable } from './defineTable';
import { date, flag, optional, ref, text } from './primitives';

export const deployment = defineTable({
  fields: (v) => ({
    asset: ref,
    chain: ref,
    address: text,
    aliases: optional(z.array(text)),
    deployedAt: optional(date),
    primary: optional(flag),
    standard: optional(v['token-standard']),
    bridgedFrom: optional(ref),
    bridgeMethod: optional(v['bridge-method']),
  }),
  implied: 'asset',
  children: { labels: 'address_label', events: 'event' },
});
