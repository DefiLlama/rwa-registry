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
    impliesStablecoin: optional(flag),
    impliesGovernance: optional(flag),
    estimateRevenue: optional(flag),
  }),
  implied: 'vocabulary',
});
