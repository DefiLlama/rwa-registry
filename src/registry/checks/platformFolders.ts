/**
 * platformFolders: each asset folder holds a platform.json of an organization of kind platform, in that one home.
 * @dev review: src/registry/layout.ts
 */
import { PlatformFolderError } from '../../errors';
import type { Registry } from '../../schema';
import { platformFile } from '../layout';
import { report, type Problem } from '../problem';

export const platformFolders = (registry: Registry): Problem[] => {
  const organizations = new Map(registry.organization.map((row) => [row.slug, row]));
  const seen = new Set<string>();
  return registry.asset.flatMap((row) => {
    if (seen.has(row.platform)) return [];
    seen.add(row.platform);
    const platform = organizations.get(row.platform);
    if (!platform) {
      return [report(PlatformFolderError, 'asset', row, 'platform', `${platformFile(row.platform)} is missing`)];
    }
    if (platform.kind !== 'platform') {
      const message = `organization ${platform.slug} of assets/${row.platform} is of kind ${platform.kind}, not platform`;
      return [report(PlatformFolderError, 'organization', platform, 'kind', message)];
    }
    return [];
  });
};
