/**
 * categoryRules: every asset's structure and the exposure of its underlying name one category rule, which shelves the asset.
 * @dev review: src/registry/deriveFields.ts
 */
import { CategoryRuleError } from '../../errors';
import type { Registry } from '../../schema';
import { CATEGORY_RULES_FILE } from '../layout';
import { report, type Problem } from '../problem';

export const categoryRules = (registry: Registry): Problem[] => {
  const rules = new Set(registry.category_rule.map((rule) => `${rule.structure}:${rule.exposure}`));
  const exposures = new Map(registry.underlying.map((row) => [row.slug, row.exposure]));
  const structures = new Set(registry.vocabulary.filter((row) => row.vocabulary === 'asset-class').map((row) => row.slug));
  return registry.asset.flatMap((row) => {
    const exposure = exposures.get(row.underlying);
    // A missing or unknown structure, or a missing exposure, is the schema's finding, so it is not reported twice.
    if (!structures.has(row.structure) || exposure == null || rules.has(`${row.structure}:${exposure}`)) return [];
    const message = `no category rule for structure ${row.structure} and exposure ${exposure}; add one to ${CATEGORY_RULES_FILE}`;
    return [report(CategoryRuleError, 'asset', row, 'structure', message)];
  });
};
