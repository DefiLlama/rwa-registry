/**
 * links: the websites, social accounts and reference links of an organization, and the narrower links of an asset.
 * @dev review: src/schema/organization.ts
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

// An asset holds its product pages only; its social accounts and referral links are its platform's.
export const assetLinks = links.pick({ website: true });
