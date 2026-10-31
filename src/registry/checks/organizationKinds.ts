/**
 * organizationKinds: an organization's folder names a kind, the platform and review blocks sit on a platform kind, and a venue names one.
 * @dev review: src/registry/layout.ts
 */
import { OrganizationKindError } from '../../errors';
import { blockFields, type Registry } from '../../schema';
import { PLATFORM_KINDS } from '../../schema/organization';
import { report, type Problem } from '../problem';

const PLATFORM_BLOCKS = ['platform', 'review'];

export const organizationKinds = (registry: Registry): Problem[] => {
  const kinds = registry.vocabulary.filter((row) => row.vocabulary === 'organization-kind').map((row) => row.slug);
  const problems: Problem[] = [];
  for (const row of registry.organization) {
    if (!kinds.includes(row.kind)) {
      const message = `reference/organizations/${row.kind}/ is not an organization kind; the kinds are ${kinds.join(', ')}`;
      problems.push(report(OrganizationKindError, 'organization', row, '', message));
    }
    if (PLATFORM_KINDS.includes(row.kind)) continue;
    for (const block of PLATFORM_BLOCKS) {
      const set = blockFields('organization', block).filter((field) => (row as Record<string, unknown>)[field] != null);
      for (const field of set) {
        const message = `${field} is a field of the ${block} block, which only ${PLATFORM_KINDS.join(' and ')} organizations hold`;
        problems.push(report(OrganizationKindError, 'organization', row, field, message));
      }
    }
  }
  const kindOf = new Map(registry.organization.map((row) => [row.slug, row.kind]));
  for (const venue of registry.venue) {
    const kind = kindOf.get(venue.organization);
    if (kind === undefined || PLATFORM_KINDS.includes(kind)) continue;
    const message = `venue ${venue.slug} names ${venue.organization}, of kind ${kind}; a venue names its operator in perps/${venue.slug}/organization.json or a platform`;
    problems.push(report(OrganizationKindError, 'venue', venue, 'organization', message));
  }
  return problems;
};
