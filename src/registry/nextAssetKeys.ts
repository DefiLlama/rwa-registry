/**
 * nextAssetKeys: a new asset's legacy id and slug, the ones given kept, the others assigned; the id is one above every id the registry ever held.
 * @dev review: src/cli/commands/add-asset.ts
 */
import type { Registry } from '../schema';
import { rowSlug } from './rwaSlug';

// The app served RWA IDs up to 9717 before the registry, so a new id never reuses one of them.
const LAST_SERVED_LEGACY_ID = 9717;

// On a slug collision the lower id keeps the bare slug, so the new row takes -<legacyId>.
export const nextAssetKeys = (
  registry: Registry,
  canonicalMarketId: string,
  given: { legacyId?: number | null; slug?: string | null } = {},
): { legacyId: number; slug: string } => {
  const taken = [...registry.asset, ...registry.perp_market].map((row) => row.legacyId ?? 0);
  const legacyId = given.legacyId ?? Math.max(LAST_SERVED_LEGACY_ID, ...taken) + 1;
  const bare = rowSlug(canonicalMarketId);
  const slug = given.slug ?? (registry.asset.some((row) => row.slug === bare) ? `${bare}-${legacyId}` : bare);
  return { legacyId, slug };
};
