/**
 * addressLabel: one excluded holder address on one deployment.
 * @dev review: src/schema/deployment.ts
 */
import { defineTable } from './defineTable';
import { ref, text } from './primitives';

export const addressLabel = defineTable({
  fields: (v) => ({
    deployment: ref,
    address: text,
    kind: v['label-kind'],
  }),
  implied: 'deployment',
});
