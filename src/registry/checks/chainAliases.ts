/**
 * chainAliases: one chain is one row. No chain shares its label with another or has a slug another lists as an
 * alias, and no deployment, venue or organization names a chain by an alias, so a feed's chain lands on one row.
 * @dev review: src/registry/chainNames.ts
 */
import { ChainAliasError } from '../../errors';
import type { Registry, TableName } from '../../schema';
import { nameKey } from '../chainNames';
import { report, type Problem } from '../problem';

const USES: [table: TableName, field: string][] = [
  ['deployment', 'chain'],
  ['venue', 'chain'],
  ['organization', 'primaryChain'],
  ['organization', 'chains'],
];

export const chainAliases = (registry: Registry): Problem[] => {
  const slugs = new Set(registry.chain.map((row) => row.slug));
  const aliasOf = new Map<string, string>();
  for (const row of registry.chain)
    for (const alias of row.aliases ?? []) if (nameKey(alias) !== nameKey(row.slug)) aliasOf.set(nameKey(alias), row.slug);
  const labelOf = new Map<string, string>();
  const problems: Problem[] = [];
  for (const row of registry.chain) {
    const sameLabel = labelOf.get(nameKey(row.label));
    if (sameLabel) {
      const message = `chain ${row.slug} has the label ${row.label} of chain ${sameLabel}; keep one row and list the other slug as its alias`;
      problems.push(report(ChainAliasError, 'chain', row, 'label', message));
    } else labelOf.set(nameKey(row.label), row.slug);
    const owner = aliasOf.get(nameKey(row.slug));
    if (owner && owner !== row.slug) {
      const message = `chain ${row.slug} is an alias of chain ${owner}; move its rows to ${owner}`;
      problems.push(report(ChainAliasError, 'chain', row, 'slug', message));
    }
  }
  for (const [table, field] of USES) {
    for (const row of registry[table] as Record<string, unknown>[]) {
      const value = row[field];
      (Array.isArray(value) ? value : [value]).forEach((name, i) => {
        if (typeof name !== 'string' || slugs.has(name) || !aliasOf.has(nameKey(name))) return;
        const at = Array.isArray(value) ? `${field}[${i}]` : field;
        const message = `${at} names chain ${name}, an alias of chain ${aliasOf.get(nameKey(name))}; use the slug`;
        problems.push(report(ChainAliasError, table, row, at, message));
      });
    }
  }
  return problems;
};
