/**
 * deployment: one asset at one address on one chain, or on a chain with no known contract, nested in its asset file; the one marked primary names the asset's primary chain.
 * @dev review: src/schema/addressLabel.ts
 */
import { defineTable } from './defineTable';
import { date, flag, optional, ref, text } from './primitives';

export const deployment = defineTable({
  fields: (v) => ({
    asset: ref,
    chain: ref,
    // null: a chain the sheet names with no known contract.
    address: optional(text),
    deployedAt: optional(date),
    primary: optional(flag),
    standard: optional(v['token-standard']),
    bridgedFrom: optional(ref),
    bridgeMethod: optional(v['bridge-method']),
  }),
  implied: 'asset',
  children: { labels: 'address_label', events: 'event' },
});
