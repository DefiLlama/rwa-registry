/**
 * role: one organization in one role on one target row, dated; an issuer role also holds the DefiLlama protocol ids of that issuer.
 * @dev review: src/schema/target.ts
 */
import { z } from 'zod';
import { defineTable } from './defineTable';
import { date, optional, protocolId, ref, url } from './primitives';
import { target } from './target';

export const role = defineTable({
  fields: (v) => ({
    organization: ref,
    kind: v['role-kind'],
    target: target,
    from: optional(date),
    to: optional(date),
    sourceLinks: optional(z.array(url)),
    protocolIds: optional(z.array(protocolId)),
  }),
  implied: 'target',
});
