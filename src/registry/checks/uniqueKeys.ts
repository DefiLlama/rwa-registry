/**
 * uniqueKeys: no two rows share a key, a legacy id, a canonical market id, a lowercase market id or an identifier.
 * @dev review: src/registry/keys.ts
 */
import { DuplicateKeyError, SharedIsinError } from '../../errors';
import { TABLE_NAMES, type Registry, type TableName } from '../../schema';
import { keyOf, marketId, rowsOf, type AnyRow } from '../keys';
import { report, type Problem } from '../problem';

type Unique = { table: TableName; what: string; values: (row: AnyRow) => unknown[] };

// A published id or an identifier names one row across tables, so its id leaves the table out.
const ACROSS_TABLES = new Set(['legacyId', 'identifier']);

const field = (name: string) => (row: AnyRow) => (row[name] == null ? [] : [row[name]]);
const identifiers = (row: AnyRow) =>
  ((row.identifiers as { scheme: string; value: string }[] | null | undefined) ?? []).map(
    (identifier) => `${identifier.scheme} ${identifier.value}`,
  );

// The sheet puts the underlying's ISIN on its wrapper and twin rows, so one ISIN on two assets, or on an asset and an
// underlying, only warns.
const SHARED_ISIN = new Set(['asset:asset', 'asset:underlying', 'underlying:asset']);
const isAssetIsin = (what: string, value: unknown, table: TableName, holder: TableName) =>
  what === 'identifier' && String(value).startsWith('isin ') && SHARED_ISIN.has(`${table}:${holder}`);

// Two holder labels that differ only in case would subtract one holder twice.
const uniqueKey = (table: TableName, row: AnyRow) =>
  table === 'address_label' ? keyOf(table, row).toLowerCase() : keyOf(table, row);

const UNIQUE: Unique[] = [
  ...TABLE_NAMES.map((table) => ({ table, what: 'key', values: (row: AnyRow) => [uniqueKey(table, row)] })),
  { table: 'asset', what: 'legacyId', values: field('legacyId') },
  { table: 'asset', what: 'canonicalMarketId', values: field('canonicalMarketId') },
  { table: 'organization', what: 'legacyPid', values: field('legacyPid') },
  { table: 'perp_market', what: 'legacyId', values: field('legacyId') },
  { table: 'perp_market', what: 'lowercase id', values: (row) => [marketId(row as { venue: string; symbol: string })] },
  ...(['organization', 'underlying', 'asset'] as const).map((table) => ({ table, what: 'identifier', values: identifiers })),
];

export const uniqueKeys = (registry: Registry): Problem[] => {
  const problems: Problem[] = [];
  const holders = new Map<string, { table: TableName; key: string }>();
  for (const { table, what, values } of UNIQUE) {
    for (const row of rowsOf(registry, table)) {
      const key = keyOf(table, row);
      for (const value of new Set(values(row))) {
        const id = `${ACROSS_TABLES.has(what) ? '' : table} ${what} ${value}`;
        const holder = holders.get(id);
        if (!holder) holders.set(id, { table, key });
        else if (what === 'key' || holder.table !== table || holder.key !== key) {
          const message = `${id.trim()} is also on ${holder.table} ${holder.key}`;
          problems.push(
            isAssetIsin(what, value, table, holder.table)
              ? report(SharedIsinError, table, row, '', message, 'warning')
              : report(DuplicateKeyError, table, row, '', message),
          );
        }
      }
    }
  }
  return problems;
};
