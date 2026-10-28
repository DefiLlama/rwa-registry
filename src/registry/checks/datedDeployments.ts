/**
 * datedDeployments: a deployment new against the base needs deployedAt, and an undated one the base holds only warns.
 * @dev review: src/registry/checks/frozenKeys.ts
 */
import { UndatedDeploymentError } from '../../errors';
import type { Registry } from '../../schema';
import { keyOf, keySets } from '../keys';
import { report, type Problem } from '../problem';

export const datedDeployments = (registry: Registry, base: Registry | null): Problem[] => {
  const known = base ? keySets(base).deployment : null;
  return registry.deployment
    .filter((row) => row.deployedAt == null)
    .map((row) => {
      const key = keyOf('deployment', row);
      return !known || known.has(key)
        ? report(UndatedDeploymentError, 'deployment', row, 'deployedAt', `${key} has no deployedAt`, 'warning')
        : report(UndatedDeploymentError, 'deployment', row, 'deployedAt', `new deployment ${key} needs deployedAt`);
    });
};
