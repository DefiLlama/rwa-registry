/**
 * datedDeployments: a deployment new against the base needs deployedAt, and an undated one the base holds only warns; a chain with no known contract has no creation to date, and a chain no reader can date is only ever warned on.
 * @dev review: src/registry/checks/frozenKeys.ts, src/registry/chains.ts
 */
import { UndatedDeploymentError } from '../../errors';
import type { Registry } from '../../schema';
import { isDatable } from '../chains';
import { keyOf, keySets } from '../keys';
import { report, type Problem } from '../problem';

export const datedDeployments = (registry: Registry, base: Registry | null): Problem[] => {
  const known = base ? keySets(base).deployment : null;
  return registry.deployment
    .filter((row) => row.address != null && row.deployedAt == null)
    .map((row) => {
      const key = keyOf('deployment', row);
      return !known || known.has(key) || !isDatable(row.chain)
        ? report(UndatedDeploymentError, 'deployment', row, 'deployedAt', `${key} has no deployedAt`, 'warning')
        : report(UndatedDeploymentError, 'deployment', row, 'deployedAt', `new deployment ${key} needs deployedAt`);
    });
};
