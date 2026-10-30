/**
 * deriveFields: the fields the build writes at a build date, from an asset's primary chain to each row's status.
 * @dev review: src/registry/keys.ts
 */
import { EVENT_KINDS, type Registry, type Row, type TableName } from '../schema';
import { groupBy } from '../utils/groupBy';
import { keyOf, marketId, targetKey } from './keys';

type Event = Row<'event'>;

// An event with no date counts as having happened; a retirement, migration, split or maturity ends its target from its day.
const happened = (event: Event, day: string): boolean => event.date == null || event.date <= day;
const endsTarget = (event: Event, day: string): boolean => EVENT_KINDS[event.kind]?.ends === true && happened(event, day);

const endedRows = (registry: Registry, day: string): ((table: TableName, row: object) => boolean) => {
  const ended = new Set(registry.event.filter((event) => endsTarget(event, day)).map((event) => targetKey(event.target)));
  return (table, row) => ended.has(targetKey({ table, key: keyOf(table, row) }));
};

// An undated event has happened on an unknown day, so it sorts after every dated one.
export const latestOf = (events: Event[], kinds: string[]): Event | undefined =>
  events
    .filter((event) => kinds.includes(event.kind))
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
    .at(-1);

const LISTING_KINDS = Object.keys(EVENT_KINDS).filter((kind) => EVENT_KINDS[kind]!.lists === true);

const statusOf = (events: Event[], at: string): 'listed' | 'delisted' | 'retired' => {
  if (events.some((event) => endsTarget(event, at))) return 'retired';
  const latest = latestOf(
    events.filter((event) => happened(event, at)),
    LISTING_KINDS,
  );
  return latest?.kind === 'delisting' ? 'delisted' : 'listed';
};

export type Flags = { stablecoin: boolean; governance: boolean };

// A stablecoin or a governance token is one whose categories, asset class or classification imply it in the vocabularies, before any override.
export const derivedFlagsOf = (registry: Registry) => {
  const flags = new Map(registry.vocabulary.map((row) => [`${row.vocabulary}:${row.slug}`, row]));
  return (asset: Row<'asset'>): Flags => {
    const keys = [
      ...asset.category.map((slug) => `category:${slug}`),
      `asset-class:${asset.structure}`,
      `rwa-classification:${asset.rwaClassification}`,
    ];
    const has = (flag: 'impliesStablecoin' | 'impliesGovernance') => keys.some((key) => flags.get(key)?.[flag] === true);
    return { stablecoin: has('impliesStablecoin'), governance: has('impliesGovernance') };
  };
};

// The chain of the primary deployment, else the platform's primary chain; primaryDeployments fails an asset with neither.
const primaryChainsOf = (registry: Registry) => {
  const primary = new Map(registry.deployment.filter((row) => row.primary === true).map((row) => [row.asset, row.chain]));
  const platform = new Map(registry.organization.map((row) => [row.slug, row.primaryChain]));
  return (asset: Row<'asset'>) => primary.get(asset.slug) ?? platform.get(asset.platform) ?? '';
};

const protocolIdsOf = (registry: Registry) => {
  const issuers = groupBy(
    registry.role.filter((role) => role.kind === 'issuer' && role.target.table === 'asset' && role.protocolIds?.length),
    (role) => role.target.key,
  );
  return (asset: Row<'asset'>) =>
    issuers.get(asset.slug)?.flatMap((role) => role.protocolIds ?? []) ?? asset.protocolIds ?? null;
};

export const deriveFields = (registry: Registry, at: string): Registry => {
  const events = groupBy(registry.event, (event) => targetKey(event.target));
  const eventsOf = (table: TableName, row: object) => events.get(targetKey({ table, key: keyOf(table, row) })) ?? [];
  const ended = endedRows(registry, at);
  const flagsOf = derivedFlagsOf(registry);
  const primaryChainOf = primaryChainsOf(registry);
  const issuerProtocolIdsOf = protocolIdsOf(registry);
  const chains = new Map<string, string[]>();
  for (const deployment of registry.deployment) {
    if (ended('deployment', deployment)) continue;
    const own = chains.get(deployment.asset) ?? [];
    if (!own.includes(deployment.chain)) chains.set(deployment.asset, [...own, deployment.chain]);
  }
  return {
    ...registry,
    asset: registry.asset.map((row) => {
      const derived = flagsOf(row);
      const stablecoin = row.stablecoinOverride ?? derived.stablecoin;
      const governance = row.governanceOverride ?? derived.governance;
      const kind = governance ? 'governance' : stablecoin ? 'stablecoin' : 'claim';
      const status = statusOf(eventsOf('asset', row), at);
      return {
        ...row,
        primaryChain: primaryChainOf(row),
        issuerProtocolIds: issuerProtocolIdsOf(row),
        kind,
        stablecoin,
        governance,
        status,
        chains: chains.get(row.slug) ?? [],
      };
    }),
    // A file written by a command leaves nulls out, and the server reads a chain with no known contract as address null.
    deployment: registry.deployment.map((row) => ({ ...row, address: row.address ?? null })),
    perp_market: registry.perp_market.map((row) => ({
      ...row,
      id: marketId(row),
      status: statusOf(eventsOf('perp_market', row), at),
    })),
    venue: registry.venue.map((row) => ({ ...row, status: statusOf(eventsOf('venue', row), at) })),
    organization: registry.organization.map((row) => ({ ...row, status: statusOf(eventsOf('organization', row), at) })),
  };
};
