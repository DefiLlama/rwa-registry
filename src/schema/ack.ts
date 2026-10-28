/**
 * ack: one guard exception on one asset, with its reason and the step that resolves it.
 * @dev review: src/schema/asset.ts
 */
import { defineTable } from './defineTable';
import * as enums from './enums';
import { date, optional, ref, slug, text } from './primitives';

export const ack = defineTable({
  fields: () => ({
    slug: slug,
    guard: enums.ackGuard,
    asset: ref,
    from: date,
    until: optional(date),
    reason: text,
    resolve: text,
  }),
});
