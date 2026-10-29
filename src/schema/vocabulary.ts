/**
 * vocabulary: one value of one closed list, a row of reference/vocabularies/<vocabulary>.json.
 * @dev review: src/schema/compileSchemas.ts
 */
import { z } from 'zod';
import { defineTable } from './defineTable';
import { flag, optional, slug, text } from './primitives';

export const vocabulary = defineTable({
  fields: () => ({
    vocabulary: slug,
    slug: slug,
    label: text,
    description: optional(text),
    aliases: optional(z.array(text)),
    // On an asset-group value only: the underlying class, the folder under reference/underlyings/ that holds this exposure.
    class: optional(slug),
    impliesStablecoin: optional(flag),
    impliesGovernance: optional(flag),
    estimateRevenue: optional(flag),
  }),
  implied: 'vocabulary',
});
