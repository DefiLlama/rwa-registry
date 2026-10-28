/**
 * homeOrganizations: each organization written in the home of its kind. A platform keeps its asset folder and a Platforms tab row with no assets gets one, a venue operator moves beside its venue, any other organization goes under the kind of the roles it holds most.
 * @dev review: src/registry/layout.ts
 */
import { homeOf, platformFile, venueOperatorFile } from '../registry/layout';
import { modal } from '../utils/modal';
import type { Call, FileJson, RegistryFiles } from './importTypes';

// The organization kind a role files its holder under; a role kind not here files nobody.
export const KIND_OF_ROLE: Record<string, string> = {
  issuer: 'issuer',
  tokenizer: 'tokenizer',
  oracle: 'oracle',
  auditor: 'auditor',
  custodian: 'custodian',
  'fund-administrator': 'administrator',
  'transfer-agent': 'administrator',
  'paying-agent': 'administrator',
  'security-agent': 'administrator',
  manager: 'manager',
  sponsor: 'manager',
  'sub-advisor': 'manager',
  originator: 'manager',
  supervisor: 'supervisor',
};

export const ORGANIZATION_KINDS = [
  'platform',
  'venue-operator',
  ...new Set(Object.values(KIND_OF_ROLE)),
  'brand',
  'unassigned',
];

const TOPIC = 'organizations';
const STAGED = /^reference\/organizations\/([^/]+)\.json$/;

export const homeOrganizations = (staged: RegistryFiles): { files: RegistryFiles; calls: Call[] } => {
  const files: RegistryFiles = new Map();
  const heldKinds = new Map<string, string[]>();
  const venuesOf = new Map<string, string[]>();
  for (const [path, json] of staged) {
    if (Array.isArray(json)) continue;
    for (const role of (json.roles as FileJson[] | undefined) ?? []) {
      const kind = KIND_OF_ROLE[String(role.kind)];
      if (kind) heldKinds.set(String(role.organization), [...(heldKinds.get(String(role.organization)) ?? []), kind]);
    }
    if (homeOf(path)?.table === 'venue') {
      const operator = String(json.organization);
      venuesOf.set(operator, [...(venuesOf.get(operator) ?? []), String(json.slug)].sort());
    }
  }
  const bare: string[] = [];
  const unassigned: string[] = [];
  const shared: string[] = [];
  for (const [path, json] of staged) {
    const slug = STAGED.exec(path)?.[1];
    if (/^assets\/[^/]+\/platform\.json$/.test(path) && !Array.isArray(json)) {
      const { kind: _, ...platform } = json;
      files.set(path, platform);
      continue;
    }
    if (!slug || Array.isArray(json)) {
      files.set(path, json);
      continue;
    }
    const { kind: written, ...organization } = json;
    const venues = venuesOf.get(slug) ?? [];
    const kind = venues.length
      ? 'venue-operator'
      : written === 'platform'
        ? 'platform'
        : (modal(heldKinds.get(slug) ?? []) ?? (written === 'brand' ? 'brand' : 'unassigned'));
    if (venues.length > 1) shared.push(`${slug} (${venues.join(', ')})`);
    if (kind === 'platform') bare.push(slug);
    if (kind === 'unassigned') unassigned.push(slug);
    const home =
      kind === 'venue-operator'
        ? venueOperatorFile(venues[0])
        : kind === 'platform'
          ? platformFile(slug)
          : `reference/organizations/${kind}/${slug}.json`;
    files.set(home, organization);
  }
  const calls: Call[] = [];
  if (bare.length) {
    calls.push({
      topic: TOPIC,
      line: `${bare.length} Platforms tab rows hold no asset and sit in an asset folder of their own; merge or keep: ${bare.sort().join(', ')}`,
    });
  }
  if (unassigned.length) {
    calls.push({
      topic: TOPIC,
      line: `${unassigned.length} organizations hold no role, so no kind; they sit in reference/organizations/unassigned/: ${unassigned.sort().join(', ')}`,
    });
  }
  for (const line of shared) {
    calls.push({
      topic: TOPIC,
      line: `${line} operates several venues; its file sits beside the first, which the others name`,
    });
  }
  return { files, calls };
};
