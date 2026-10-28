/**
 * flagOverrides: an override in an asset's class block keeps a published flag the rule would change; one equal to the derived flag is stale and only warns.
 * @dev review: src/registry/deriveFields.ts
 */
import { StaleFlagOverrideError } from '../../errors';
import type { Registry } from '../../schema';
import { derivedFlagsOf } from '../deriveFields';
import { report, type Problem } from '../problem';

const OVERRIDES = [
  ['stablecoinOverride', 'stablecoin'],
  ['governanceOverride', 'governance'],
] as const;

export const flagOverrides = (registry: Registry): Problem[] => {
  const derivedOf = derivedFlagsOf(registry);
  return registry.asset.flatMap((row) => {
    const derived = derivedOf(row);
    return OVERRIDES.filter(([field, flag]) => row[field] != null && row[field] === derived[flag]).map(([field, flag]) =>
      report(
        StaleFlagOverrideError,
        'asset',
        row,
        field,
        `${row.slug} overrides ${flag} with ${row[field]}, which its rule already derives; remove the override`,
        'warning',
      ),
    );
  });
};
