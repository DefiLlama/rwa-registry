/**
 * instrument: one legal product that several asset classes or a fund share.
 * @dev review: src/schema/asset.ts
 */
import { defineTable } from './defineTable';
import { optional, slug, text } from './primitives';

export const instrument = defineTable({
  fields: (v) => ({
    slug: slug,
    name: text,
    legalForm: optional(v['legal-form']),
  }),
  children: { roles: 'role' },
});
