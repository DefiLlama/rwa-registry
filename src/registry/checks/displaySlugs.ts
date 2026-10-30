/**
 * displaySlugs: a platform, venue organization or vocabulary slug is rwaSlug of its name.
 * @dev review: src/registry/rwaSlug.ts
 */
import { SlugRuleError } from '../../errors';
import type { Registry, TableName } from '../../schema';
import { report, type Problem } from '../problem';
import { rwaSlug } from '../rwaSlug';

const slugRule = (table: TableName, row: { slug: string }, label: string): Problem[] =>
  row.slug === rwaSlug(label)
    ? []
    : [report(SlugRuleError, table, row, 'slug', `slug ${row.slug} differs from rwaSlug("${label}") ${rwaSlug(label)}`)];

export const displaySlugs = (registry: Registry): Problem[] => {
  const venueOrganizations = new Set(registry.venue.map((row) => row.organization));
  return [
    ...registry.organization
      .filter((row) => row.kind === 'platform' || venueOrganizations.has(row.slug))
      .flatMap((row) => slugRule('organization', row, row.name)),
    ...registry.vocabulary.flatMap((row) => slugRule('vocabulary', row, row.label)),
  ];
};
