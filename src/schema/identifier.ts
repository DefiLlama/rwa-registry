/**
 * identifier: one ISIN, FIGI or LEI, the source it was read from, and whether someone read it there.
 * @dev review: src/registry/checks/identifierSources.ts
 */
import { z } from 'zod';
import { identifierScheme } from './enums';
import { flag, optional, text } from './primitives';

export const identifier = z
  .strictObject({
    scheme: identifierScheme,
    value: text,
    source: optional(text.min(1, 'an identifier source names the page it was read from')),
    verified: flag,
  })
  .refine((item) => !item.verified || item.source != null, {
    path: ['source'],
    message: 'a verified identifier names the source it was read from',
  });
