/**
 * links: the websites, social accounts and reference links of an organization, and the narrower links of an asset.
 * @dev review: src/schema/organization.ts
 */
import { z } from 'zod';
import { optional, url } from './primitives';

export const links = z.strictObject({
  website: optional(z.array(url)),
  twitter: optional(url),
  docs: optional(url),
  linkedin: optional(url),
  discord: optional(url),
  telegram: optional(url),
  github: optional(url),
  refLinks: optional(z.array(url)),
});

// An asset holds its product pages only; its social accounts and referral links are its platform's.
export const assetLinks = links.pick({ website: true });
