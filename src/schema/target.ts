/**
 * target: the table and the key of the row a role or an event is about.
 * @dev review: src/registry/keys.ts
 */
import { z } from 'zod';
import { targetTable } from './enums';
import { text } from './primitives';

export const target = z.strictObject({
  table: targetTable,
  key: text,
});
