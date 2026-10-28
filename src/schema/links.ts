/**
 * links: the websites, social accounts and reference links of an asset or an organization.
 * @dev review: src/schema/asset.ts
 */
import { z } from 'zod';
import { optional, text } from './primitives';

export const links = z.strictObject({
  website: optional(z.array(text)),
  twitter: optional(text),
  docs: optional(text),
  linkedin: optional(text),
  discord: optional(text),
  telegram: optional(text),
  github: optional(text),
  refLinks: optional(z.array(text)),
});
