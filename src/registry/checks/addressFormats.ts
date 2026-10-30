/**
 * addressFormats: a deployment address is in the key form of the chain's family, a holder label in its account form; a family with no form here passes, and so do a deployment with no address and an address on a chain the sdk does not know, kept as the sheet wrote it.
 * @dev review: src/registry/addressFamilies.ts
 */
import { AddressFormatError } from '../../errors';
import type { AddressFamily, Registry } from '../../schema';
import { ACCOUNT_PATTERNS, ADDRESS_PATTERNS } from '../addressFamilies';
import { familyOf } from '../chains';
import { keyOf } from '../keys';
import { report, type Problem } from '../problem';

export const addressFormats = (registry: Registry): Problem[] => {
  const families = new Map([...new Set(registry.deployment.map((row) => row.chain))].map((key) => [key, familyOf(key)]));
  const familyOfDeployment = new Map(registry.deployment.map((row) => [keyOf('deployment', row), families.get(row.chain)]));
  const misfit = (family: AddressFamily | null | undefined, value: string, patterns: Partial<Record<AddressFamily, RegExp>>) => {
    const pattern = family ? patterns[family] : undefined;
    return pattern !== undefined && !pattern.test(value);
  };
  const deployments = registry.deployment
    .filter((row) => row.address != null && misfit(families.get(row.chain), row.address, ADDRESS_PATTERNS))
    .map((row) => {
      const message = `${row.chain}:${row.address} is not a ${families.get(row.chain)} token address`;
      return report(AddressFormatError, 'deployment', row, 'address', message);
    });
  const labels = registry.address_label
    .filter((row) => misfit(familyOfDeployment.get(row.deployment), row.address, ACCOUNT_PATTERNS))
    .map((row) => {
      const message = `holder ${row.address} on ${row.deployment} is not a ${familyOfDeployment.get(row.deployment)} account address`;
      return report(AddressFormatError, 'address_label', row, 'address', message);
    });
  return [...deployments, ...labels];
};
