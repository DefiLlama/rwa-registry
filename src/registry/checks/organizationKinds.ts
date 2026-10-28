/**
 * organizationKinds: an organization's folder names a kind, a block is held only by its kinds, and a venue names its operator or a platform; fileNames puts a platform and a venue operator in their homes.
 * @dev review: src/registry/layout.ts
 */
import { OrganizationKindError } from '../../errors';
import { blockFields, type Registry } from '../../schema';
import { KIND_BLOCKS } from '../../schema/organization';
import { HOME_KINDS } from '../layout';
import { report, type Problem } from '../problem';

export const organizationKinds = (registry: Registry): Problem[] => {
  const kinds = registry.vocabulary.filter((row) => row.vocabulary === 'organization-kind').map((row) => row.slug);
  const problems: Problem[] = [];
  for (const row of registry.organization) {
    if (!kinds.includes(row.kind)) {
      const message = `reference/organizations/${row.kind}/ is not an organization kind; the kinds are ${kinds.join(', ')}`;
      problems.push(report(OrganizationKindError, 'organization', row, '', message));
    }
    for (const [block, owners] of Object.entries(KIND_BLOCKS)) {
      if (owners.includes(row.kind)) continue;
      const set = blockFields('organization', block).filter((field) => (row as Record<string, unknown>)[field] != null);
      for (const field of set) {
        const message = `${field} is a field of the ${block} block, which only ${owners.join(' and ')} organizations hold`;
        problems.push(report(OrganizationKindError, 'organization', row, field, message));
      }
    }
  }
  const kindOf = new Map(registry.organization.map((row) => [row.slug, row.kind]));
  for (const venue of registry.venue) {
    const kind = kindOf.get(venue.organization);
    if (kind === undefined || kind in HOME_KINDS) continue;
    const message = `venue ${venue.slug} names ${venue.organization}, of kind ${kind}; a venue names its operator in perps/${venue.slug}/organization.json or a platform`;
    problems.push(report(OrganizationKindError, 'venue', venue, 'organization', message));
  }
  return problems;
};
