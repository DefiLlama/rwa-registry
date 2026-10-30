/**
 * contractlessDeployments: a deployment with no address keeps its chain on the asset's chain list while the server reads nothing there, so it warns until a contract is known.
 * @dev review: src/registry/checks/datedDeployments.ts
 */
import { ContractlessDeploymentError } from '../../errors';
import type { Registry } from '../../schema';
import { report, type Problem } from '../problem';

export const contractlessDeployments = (registry: Registry): Problem[] =>
  registry.deployment
    .filter((row) => row.address == null)
    .map((row) => {
      const message = `${row.asset} on ${row.chain} has no known contract; the chain is listed and nothing is read there`;
      return report(ContractlessDeploymentError, 'deployment', row, 'address', message, 'warning');
    });
