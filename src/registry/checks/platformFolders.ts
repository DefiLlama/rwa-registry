/**
 * platformFolders: each asset folder holds a platform.json of an organization of kind platform, in that one home.
 * @dev review: src/registry/layout.ts
 */
import { PlatformFolderError } from '../../errors';
import type { Registry } from '../../schema';
import { platformFile } from '../layout';
import { fileOf, placeOf } from '../place';
import { report, toProblem, type Problem } from '../problem';

const kindOfFolder = (registry: Registry): Problem[] => {
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

const homeOfFolder = (registry: Registry): Problem[] => {
  const files = new Set(registry.organization.map((row) => fileOf(row)));
  const homes = new Map(
    registry.organization.filter((row) => fileOf(row) !== null).map((row) => [row.slug, placeOf('organization', row).file]),
  );
  return [...new Set(registry.asset.map((row) => row.platform))]
    .filter((platform) => homes.has(platform) && !files.has(platformFile(platform)))
    .map((platform) => {
      const message = `${platformFile(platform)} is missing; organization ${platform} lives in ${homes.get(platform)}`;
      return toProblem(new PlatformFolderError({ file: platformFile(platform), path: '', message }));
    });
};

export const platformFolders = (registry: Registry): Problem[] => [...kindOfFolder(registry), ...homeOfFolder(registry)];
