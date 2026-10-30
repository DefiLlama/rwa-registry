/**
 * primaryDeployments: at most one deployment of an asset is primary, a chain with no known contract included, and an asset with a contract and none primary takes its platform's primary chain, so it needs one.
 * @dev review: src/registry/deriveFields.ts
 */
import { PrimaryDeploymentError } from '../../errors';
import type { Registry } from '../../schema';
import { groupBy } from '../../utils/groupBy';
import { report, type Problem } from '../problem';

export const primaryDeployments = (registry: Registry): Problem[] => {
  const primaries = groupBy(
    registry.deployment.filter((row) => row.primary === true),
    (row) => row.asset,
  );
  const platformChain = new Map(registry.organization.map((row) => [row.slug, row.primaryChain]));
  const deployed = new Set(registry.deployment.filter((row) => row.address != null).map((row) => row.asset));
  // An asset folder without its platform is platformFolders' finding, so it is not reported twice.
  return registry.asset.flatMap((row) => {
    if (!platformChain.has(row.platform)) return [];
    const own = primaries.get(row.slug) ?? [];
    if (own.length > 1) {
      const chains = own.map((deployment) => deployment.chain).join(', ');
      return [report(PrimaryDeploymentError, 'asset', row, '', `${own.length} deployments are primary (${chains}); mark one`)];
    }
    // An asset with no known contract has nothing to mark; the sheet's primary chain may be one DefiLlama does not list.
    if (own.length === 0 && platformChain.get(row.platform) == null && deployed.has(row.slug)) {
      const message = `no deployment is primary and platform ${row.platform} has no primaryChain; mark one deployment primary`;
      return [report(PrimaryDeploymentError, 'asset', row, '', message)];
    }
    return [];
  });
};
