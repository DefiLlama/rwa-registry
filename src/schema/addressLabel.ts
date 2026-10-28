/**
 * addressLabel: one excluded holder address on one deployment, in force from its from day until its to day.
 * @dev review: src/schema/deployment.ts
 */
import { defineTable } from './defineTable';
import { date, optional, ref, text } from './primitives';

export const addressLabel = defineTable({
  fields: (v) => ({
    deployment: ref,
    address: text,
    kind: v['label-kind'],
    from: optional(date),
    to: optional(date),
    note: optional(text),
  }),
  implied: 'deployment',
});
