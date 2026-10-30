/**
 * targetRow: the row, key and file a command names by kind and slug: an asset, a market (venue:symbol in any case), a venue or a platform.
 * @dev review: src/cli/eventCommand.ts
 */
import { FlagFormatError, NoSuchRowError } from '../errors/cli';
import { fileOf, keyOf, marketId } from '../registry';
import type { Registry, TableName } from '../schema';
import { PLATFORM_KINDS } from '../schema/organization';

const TARGET_KINDS = {
  asset: 'asset',
  market: 'perp_market',
  venue: 'venue',
  platform: 'organization',
} as const;
type TargetKind = keyof typeof TARGET_KINDS;

export interface TargetRow {
  table: TableName;
  key: string;
  file: string;
  row: Record<string, unknown>;
}

const FINDERS: Record<TargetKind, (registry: Registry, slug: string) => object | undefined> = {
  asset: (registry, slug) => registry.asset.find((row) => row.slug === slug),
  market: (registry, slug) => registry.perp_market.find((row) => marketId(row) === slug.toLowerCase()),
  venue: (registry, slug) => registry.venue.find((row) => row.slug === slug),
  platform: (registry, slug) =>
    registry.organization.find((row) => row.slug === slug && PLATFORM_KINDS.includes(row.kind)),
};

export const TARGETS = Object.keys(TARGET_KINDS);

const SLUGS: Record<TargetKind, (registry: Registry) => string[]> = {
  asset: (registry) => registry.asset.map((row) => row.slug),
  market: (registry) => registry.perp_market.map(marketId),
  venue: (registry) => registry.venue.map((row) => row.slug),
  platform: (registry) =>
    registry.organization.filter((row) => PLATFORM_KINDS.includes(row.kind)).map((row) => row.slug),
};

// The slugs a kind's target may name, sorted; none for a kind that is not a target.
export const targetSlugs = (registry: Registry, kind: string): string[] =>
  kind in SLUGS ? SLUGS[kind as TargetKind](registry).sort() : [];

export const targetRow = (registry: Registry, kind: string, slug: string): TargetRow => {
  if (!(kind in TARGET_KINDS)) {
    throw new FlagFormatError({ file: kind, message: `is not a target; use ${Object.keys(TARGET_KINDS).join(', ')}` });
  }
  const table = TARGET_KINDS[kind as TargetKind];
  const row = FINDERS[kind as TargetKind](registry, slug);
  const file = row && fileOf(row);
  if (!row || !file) throw new NoSuchRowError({ file: slug, message: `no ${kind} ${slug} in the registry` });
  return { table, key: keyOf(table, row), file, row: row as Record<string, unknown> };
};
