/**
 * keys: the key of a row in each table, a slug, chain:address (asset|chain for a deployment with no contract), venue:symbol, or the parts of a nested row.
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
  vocabulary: (row) => `${row.vocabulary}:${row.slug}`,
  organization: (row) => row.slug,
  underlying: (row) => row.slug,
  venue: (row) => row.slug,
  asset: (row) => row.slug,
  // A chain with no known contract is one per asset, so its key is the asset and the chain.
  deployment: (row) => (row.address == null ? `${row.asset}|${row.chain}` : `${row.chain}:${row.address}`),
  perp_market: (row) => `${row.venue}:${row.symbol}`,
  role: (row) => `${row.organization}|${row.kind}|${targetKey(row.target)}|${row.from ?? ''}`,
  event: (row) => `${targetKey(row.target)}|${row.kind}|${row.date ?? ''}`,
  address_label: (row) => `${row.deployment}|${row.address}`,
  ack: (row) => `${row.kind}/${row.slug}`,
};

export const keyOf = (table: TableName, row: object): string => (KEYS[table] as (row: object) => string)(row);

export const keySets = (registry: Registry): Record<TableName, Set<string>> =>
  Object.fromEntries(
    TABLE_NAMES.map((table) => [table, new Set(registry[table].map((row) => keyOf(table, row)))]),
  ) as Record<TableName, Set<string>>;

export const rowsOf = (registry: Registry, table: TableName) => registry[table] as AnyRow[];
