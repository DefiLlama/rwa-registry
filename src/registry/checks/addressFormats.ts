/**
 * addressFormats: a deployment address and its aliases are in the key form of the chain's family, a holder label in its account form; a family with no form here passes.
 * @dev review: src/registry/addressFamilies.ts
 */
import { AddressFormatError } from '../../errors';
import type { AddressFamily, Registry } from '../../schema';
import { ACCOUNT_PATTERNS, ADDRESS_PATTERNS } from '../addressFamilies';
import { familyOf } from '../chains';
import { report, type Problem } from '../problem';

export const addressFormats = (registry: Registry): Problem[] => {
  const families = new Map([...new Set(registry.deployment.map((row) => row.chain))].map((key) => [key, familyOf(key)]));
  const familyOfDeployment = new Map(registry.deployment.map((row) => [`${row.chain}:${row.address}`, families.get(row.chain)]));
  const misfit = (family: AddressFamily | null | undefined, value: string, patterns: Partial<Record<AddressFamily, RegExp>>) => {
    const pattern = family ? patterns[family] : undefined;
    return pattern !== undefined && !pattern.test(value);
  };
  const deployments = registry.deployment.flatMap((row) => {
    const family = families.get(row.chain);
    const values: [string, string][] = [['address', row.address], ...(row.aliases ?? []).map((alias, i): [string, string] => [`aliases[${i}]`, alias])];
    return values
      .filter(([, value]) => misfit(family, value, ADDRESS_PATTERNS))
      .map(([field, value]) =>
        report(AddressFormatError, 'deployment', row, field, `${row.chain}:${value} is not a ${family} token address`),
      );
  });
  const labels = registry.address_label
    .filter((row) => misfit(familyOfDeployment.get(row.deployment), row.address, ACCOUNT_PATTERNS))
    .map((row) => {
      const message = `holder ${row.address} on ${row.deployment} is not a ${familyOfDeployment.get(row.deployment)} account address`;
      return report(AddressFormatError, 'address_label', row, 'address', message);
    });
  return [...deployments, ...labels];
};
