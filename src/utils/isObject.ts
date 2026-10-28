/**
 * isObject: a JSON object, not null and not an array.
 * @dev review: src/schema/fileShape.ts
 */
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
