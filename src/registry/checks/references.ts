/**
 * references: every reference names a row of its table, and a role or an event targets a table its kind of row may target.
 * @dev review: src/registry/keys.ts
 */
import { DanglingReferenceError } from '../../errors';
import type { Registry, TableName } from '../../schema';
import { keySets, rowsOf } from '../keys';
import { report, type Problem } from '../problem';

export const REFERENCES: Partial<Record<TableName, [field: string, table: TableName][]>> = {
  organization: [
    ['parent', 'organization'],
    ['parentPlatform', 'organization'],
    ['primaryChain', 'chain'],
    ['chains', 'chain'],
  ],
  venue: [
    ['organization', 'organization'],
    ['parent', 'venue'],
    ['chain', 'chain'],
  ],
  asset: [
    ['underlying', 'underlying'],
    ['instrument', 'instrument'],
    ['wraps', 'asset'],
  ],
  deployment: [
    ['asset', 'asset'],
    ['chain', 'chain'],
    ['bridgedFrom', 'deployment'],
  ],
  perp_market: [
    ['venue', 'venue'],
    ['tracks', 'underlying'],
    ['tracksAsset', 'asset'],
    ['collateral', 'asset'],
  ],
  role: [['organization', 'organization']],
  address_label: [['deployment', 'deployment']],
  ack: [['asset', 'asset']],
};

// An event's target table depends on its kind, which eventTargets checks; here only that the row exists.
export const TARGETS: Partial<Record<TableName, Record<string, TableName[] | null>>> = {
  role: { target: ['asset', 'instrument', 'underlying', 'venue', 'organization'] },
  event: { target: null, successor: ['asset', 'deployment', 'perp_market'] },
};

export const references = (registry: Registry): Problem[] => {
  const keys = keySets(registry);
  const problems: Problem[] = [];
  for (const [table, fields] of Object.entries(REFERENCES) as [TableName, [string, TableName][]][]) {
    for (const row of rowsOf(registry, table)) {
      for (const [field, target] of fields) {
        const value = row[field];
        const values = Array.isArray(value) ? value : [value];
        values.forEach((name, i) => {
          if (name == null || keys[target].has(String(name))) return;
          const at = Array.isArray(value) ? `${field}[${i}]` : field;
          problems.push(report(DanglingReferenceError, table, row, at, `${at} names ${target} ${name}, which does not exist`));
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
