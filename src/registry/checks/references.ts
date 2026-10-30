/**
 * references: every reference names a row of its table, and a role or an event targets a table its kind of row may target; a chain names no table (unknownChains).
 * @dev review: src/registry/keys.ts, src/registry/checks/unknownChains.ts
 */
import { DanglingReferenceError } from '../../errors';
import type { Registry, TableName } from '../../schema';
import { keyOf, keySets, rowsOf } from '../keys';
import { report, type Problem } from '../problem';

// The rows a reference may name: every row of a table, or only the rows of one class, as a fiat collateral is an fx underlying.
export type Named = TableName | { table: TableName; class: string };

export const tableOf = (named: Named): TableName => (typeof named === 'string' ? named : named.table);

const labelOf = (named: Named) => (typeof named === 'string' ? named : `${named.class} ${named.table}`);

export const REFERENCES: Partial<Record<TableName, [field: string, ...named: Named[]][]>> = {
  organization: [['parent', 'organization']],
  venue: [
    ['organization', 'organization'],
    ['parent', 'venue'],
  ],
  asset: [
    ['underlying', 'underlying'],
    ['wraps', 'asset'],
  ],
  deployment: [
    ['asset', 'asset'],
    ['bridgedFrom', 'deployment'],
  ],
  perp_market: [
    ['venue', 'venue'],
    ['tracks', 'underlying'],
    ['tracksAsset', 'asset'],
    // An asset, or the fiat currency a venue settles in when no token does, such as us-dollar on kraken.
    ['collateral', 'asset', { table: 'underlying', class: 'fx' }],
  ],
  role: [['organization', 'organization']],
  address_label: [['deployment', 'deployment']],
  ack: [
    ['asset', 'asset'],
    ['venue', 'venue'],
  ],
};

// An event's target table depends on its kind, which eventTargets checks; here only that the row exists.
export const TARGETS: Partial<Record<TableName, Record<string, TableName[] | null>>> = {
  role: { target: ['asset', 'instrument', 'underlying', 'venue', 'perp_market', 'organization'] },
  event: { target: null, successor: ['asset', 'deployment', 'perp_market'] },
};

export const references = (registry: Registry): Problem[] => {
  const keys = keySets(registry);
  const keysOf = (named: Named) =>
    typeof named === 'string'
      ? keys[named]
      : new Set(
          rowsOf(registry, named.table)
            .filter((row) => row.class === named.class)
            .map((row) => keyOf(named.table, row)),
        );
  const problems: Problem[] = [];
  for (const [table, fields] of Object.entries(REFERENCES) as [TableName, [string, ...Named[]][]][]) {
    for (const [field, ...named] of fields) {
      const held = named.map(keysOf);
      for (const row of rowsOf(registry, table)) {
        const value = row[field];
        const values = Array.isArray(value) ? value : [value];
        values.forEach((name, i) => {
          if (name == null || held.some((set) => set.has(String(name)))) return;
          const at = Array.isArray(value) ? `${field}[${i}]` : field;
          const message = `${at} names ${named.map(labelOf).join(' or ')} ${name}, which does not exist`;
          problems.push(report(DanglingReferenceError, table, row, at, message));
        });
      }
    }
  }
  for (const [table, fields] of Object.entries(TARGETS) as [TableName, Record<string, TableName[] | null>][]) {
    for (const row of rowsOf(registry, table)) {
      for (const [field, allowed] of Object.entries(fields)) {
        const target = row[field] as { table: TableName; key: string } | null | undefined;
        if (!target) continue;
        if (allowed && !allowed.includes(target.table)) {
          problems.push(report(DanglingReferenceError, table, row, field, `a ${table} may not target ${target.table}`));
        } else if (!keys[target.table].has(target.key)) {
          const message = `${field} names ${target.table} ${target.key}, which does not exist`;
          problems.push(report(DanglingReferenceError, table, row, field, message));
        }
      }
    }
  }
  return problems;
};
