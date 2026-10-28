/**
 * keys: the key of a row in each table, a slug, chain:address, venue:symbol, or the parts of a nested row.
 * @dev review: src/registry/checks/uniqueKeys.ts
 */
import type { Registry, Row, TableName } from '../schema';
import { TABLE_NAMES } from '../schema';

export type AnyRow = Record<string, unknown>;

// The published id of a perps market, its venue and symbol lowercased.
export const marketId = (market: { venue: string; symbol: string }): string =>
  `${market.venue}:${market.symbol}`.toLowerCase();

export const targetKey = (target: { table: string; key: string } | null | undefined): string =>
  target ? `${target.table}:${target.key}` : '';

const KEYS: { [T in TableName]: (row: Row<T>) => string } = {
  chain: (row) => row.slug,
  vocabulary: (row) => `${row.vocabulary}:${row.slug}`,
  category_rule: (row) => `${row.structure}:${row.exposure}`,
  organization: (row) => row.slug,
  underlying: (row) => row.slug,
  instrument: (row) => row.slug,
  venue: (row) => row.slug,
  asset: (row) => row.slug,
  deployment: (row) => `${row.chain}:${row.address}`,
  perp_market: (row) => `${row.venue}:${row.symbol}`,
  role: (row) => `${row.organization}|${row.kind}|${targetKey(row.target)}|${row.from ?? ''}`,
  event: (row) => `${targetKey(row.target)}|${row.kind}|${row.date ?? ''}`,
  address_label: (row) => `${row.deployment}|${row.address}`,
  ack: (row) => row.slug,
};

export const keyOf = (table: TableName, row: object): string => (KEYS[table] as (row: object) => string)(row);

export const keySets = (registry: Registry): Record<TableName, Set<string>> =>
  Object.fromEntries(
    TABLE_NAMES.map((table) => [table, new Set(registry[table].map((row) => keyOf(table, row)))]),
  ) as Record<TableName, Set<string>>;

export const rowsOf = (registry: Registry, table: TableName) => registry[table] as AnyRow[];
