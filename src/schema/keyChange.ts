/**
 * keyChange: one decided end of a published id, a row of registry/key-changes.json, which frozenKeys reads as a warning instead of an error.
 * @dev review: src/registry/checks/frozenKeys.ts, docs/registry.md
 */
import { z } from 'zod';
import { defineTable } from './defineTable';
import { FROZEN_TABLES, keyChangeKind } from './enums';
import { date, integer, optional, ref, text } from './primitives';

export const keyChange = defineTable({
  fields: () => ({
    table: z.enum(FROZEN_TABLES),
    // The published id: an asset's or market's legacyId, an organization's legacyPid.
    legacyId: integer,
    // The key the row was published under: its slug, or venue:symbol for a market.
    slug: ref,
    change: keyChangeKind,
    // The key that holds the id now, on a move; null on a deletion.
    to: optional(ref),
    reason: text,
    date: date,
  }),
});
