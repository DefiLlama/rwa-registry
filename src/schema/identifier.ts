/**
 * identifier: one ISIN, FIGI or LEI.
 * @dev review: src/registry/checks/uniqueKeys.ts
 */
import { z } from 'zod';
import { identifierScheme } from './enums';
import { text } from './primitives';

export const identifier = z.strictObject({
  scheme: identifierScheme,
  value: text,
});
