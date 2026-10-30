/**
 * datedDeployments: a deployment with an address and no deployedAt is the warning undated-deployment.
 * @dev review: src/registry/checks/contractlessDeployments.ts
 */
import { UndatedDeploymentError } from '../../errors';
import type { Registry } from '../../schema';
import { keyOf } from '../keys';
import { report, type Problem } from '../problem';

export const datedDeployments = (registry: Registry): Problem[] =>
  registry.deployment
    .filter((row) => row.address != null && row.deployedAt == null)
    .map((row) =>
      report(UndatedDeploymentError, 'deployment', row, 'deployedAt', `${keyOf('deployment', row)} has no deployedAt`, 'warning'),
    );
