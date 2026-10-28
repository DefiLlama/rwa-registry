/**
 * event: one dated change to one target row, nested in that row's file.
 * @dev review: src/registry/checks/eventTargets.ts
 */
import { z } from 'zod';
import { defineTable } from './defineTable';
import * as enums from './enums';
import { date, optional, text } from './primitives';
import { target } from './target';

export const event = defineTable({
  fields: (v) => ({
    target: target,
    kind: v['event-kind'],
    date: optional(date),
    successor: optional(target),
    outcome: optional(enums.reviewOutcome),
    reason: optional(text),
    links: optional(z.array(text)),
    note: optional(text),
  }),
  implied: 'target',
});
