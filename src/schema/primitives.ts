/**
 * The value types every table schema is built from.
 * @dev review: src/schema/defineTable.ts
 */
import { z } from 'zod';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const slug = z.string().regex(SLUG_PATTERN, 'a slug holds lowercase letters, digits and single hyphens');
export const text = z.string();
export const number = z.number();
export const integer = z.number().int();
export const flag = z.boolean();
export const date = z.iso.date();
export const ref = z.string().min(1);
// A DefiLlama protocol id, or a parent protocol as the sheet writes it (parent#aave).
export const protocolId = z.union([
  integer,
  z.string().regex(/^parent#[a-z0-9-]+$/, 'a protocol id is a number or parent#<slug>'),
]);

// A field that is not required may be absent or null; missing is null, never 0.
export const optional = <T extends z.ZodType>(type: T) => type.nullable().optional();
