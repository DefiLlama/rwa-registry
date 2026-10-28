/**
 * chain: one blockchain or ledger, with the address family its keys are written in and the sdk's key for it.
 * @dev review: src/schema/enums.ts
 */
import { z } from 'zod';
import { defineTable } from './defineTable';
import * as enums from './enums';
import { optional, slug, text } from './primitives';

export const chain = defineTable({
  fields: () => ({
    slug: slug,
    label: text,
    aliases: optional(z.array(text)),
    addressFamily: enums.addressFamily,
    caip2: optional(text),
    // The name the server passes to the sdk for this chain's provider; null when the sdk has none.
    sdkKey: optional(text),
    burnAddresses: optional(z.array(text)),
  }),
});
