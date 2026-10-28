/**
 * displaySlugs: a platform, venue organization or vocabulary slug is rwaSlug of its name, and a changed name warns.
 * @dev review: src/registry/rwaSlug.ts
 */
import { LabelChangeError, SlugRuleError } from '../../errors';
import type { Registry, TableName } from '../../schema';
import { keyOf, rowsOf } from '../keys';
import { report, type Problem } from '../problem';
import { rwaSlug } from '../rwaSlug';

const DISPLAY: [TableName, string][] = [
  ['chain', 'label'],
  ['vocabulary', 'label'],
  ['organization', 'name'],
  ['underlying', 'name'],
];

const slugRule = (table: TableName, row: { slug: string }, label: string): Problem[] =>
  row.slug === rwaSlug(label)
    ? []
    : [report(SlugRuleError, table, row, 'slug', `slug ${row.slug} differs from rwaSlug("${label}") ${rwaSlug(label)}`)];

export const displaySlugs = (registry: Registry, base: Registry | null): Problem[] => {
  const venueOrganizations = new Set(registry.venue.map((row) => row.organization));
  const slugs = [
    ...registry.organization
      .filter((row) => row.kind === 'platform' || venueOrganizations.has(row.slug))
      .flatMap((row) => slugRule('organization', row, row.name)),
    ...registry.vocabulary.flatMap((row) => slugRule('vocabulary', row, row.label)),
  ];
  const changes = !base
    ? []
    : DISPLAY.flatMap(([table, field]) => {
        const before = new Map(rowsOf(base, table).map((row) => [keyOf(table, row), row[field]]));
        return rowsOf(registry, table)
          .filter((row) => before.has(keyOf(table, row)) && before.get(keyOf(table, row)) !== row[field])
          .map((row) => {
            const message = `${field} of ${keyOf(table, row)} changed from "${before.get(keyOf(table, row))}" to "${row[field]}"; the app matches by it`;
            return report(LabelChangeError, table, row, field, message, 'warning');
          });
      });
  return [...slugs, ...changes];
};
