/**
 * categoryRule: the categories every asset of one structure and one exposure is shelved under, a row of reference/vocabularies/category-rules.json.
 * @dev review: src/registry/deriveFields.ts
 */
import { z } from 'zod';
import { defineTable } from './defineTable';

export const categoryRule = defineTable({
  fields: (v) => ({
    structure: v['asset-class'],
    exposure: v['asset-group'],
    category: z.array(v['category']).min(1),
  }),
});
