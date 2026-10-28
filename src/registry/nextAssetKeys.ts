/**
 * nextAssetKeys: a new asset's legacy id and slug; the id is one above every id the registry or the export ever held.
 * @dev review: src/cli/commands/add-asset.ts
 */
import type { Registry } from '../schema';
import { rowSlug } from './rwaSlug';

// The export holds RWA IDs 1 to 9717 with none missing, so an id the import left out is never reused.
const LAST_EXPORT_LEGACY_ID = 9717;

// On a slug collision the lower id keeps the bare slug, so the new row takes -<legacyId>.
export const nextAssetKeys = (registry: Registry, canonicalMarketId: string): { legacyId: number; slug: string } => {
  const taken = [...registry.asset, ...registry.perp_market].map((row) => row.legacyId ?? 0);
  const legacyId = Math.max(LAST_EXPORT_LEGACY_ID, ...taken) + 1;
  const bare = rowSlug(canonicalMarketId);
  return { legacyId, slug: registry.asset.some((row) => row.slug === bare) ? `${bare}-${legacyId}` : bare };
};
