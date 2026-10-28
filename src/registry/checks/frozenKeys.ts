/**
 * frozenKeys: a published legacy id stays on the row that holds it, so a changed id, a renamed slug or a deleted row fails.
 * @dev review: src/registry/checks/uniqueKeys.ts
 */
import { FrozenKeyError } from '../../errors';
import type { Registry, TableName } from '../../schema';
import { keyOf, rowsOf } from '../keys';
import { report, type Problem } from '../problem';

const FROZEN: [TableName, string][] = [
  ['asset', 'legacyId'],
  ['organization', 'legacyPid'],
  ['perp_market', 'legacyId'],
];

export const frozenKeys = (registry: Registry, base: Registry | null): Problem[] => {
  if (!base) return [];
  return FROZEN.flatMap(([table, field]) => {
    const byKey = new Map(rowsOf(base, table).map((row) => [keyOf(table, row), row[field] ?? null]));
    const byLegacy = new Map(
      rowsOf(base, table)
        .filter((row) => row[field] != null)
        .map((row) => [row[field], keyOf(table, row)]),
    );
    const held = new Set(rowsOf(registry, table).map((row) => row[field]));
    const keys = new Set(rowsOf(registry, table).map((row) => keyOf(table, row)));
    const changed = rowsOf(registry, table).flatMap((row) => {
      const key = keyOf(table, row);
      const legacy = row[field] ?? null;
      if (byKey.has(key) && byKey.get(key) !== legacy) {
        return [report(FrozenKeyError, table, row, field, `${field} of ${key} changed from ${byKey.get(key)} to ${legacy}`)];
      }
      const previous = legacy == null ? undefined : byLegacy.get(legacy);
      if (previous !== undefined && previous !== key) {
        return [report(FrozenKeyError, table, row, field, `${field} ${legacy} moved from ${previous} to ${key}`)];
      }
      return [];
    });
    const deleted = rowsOf(base, table)
      .filter((row) => row[field] != null && !held.has(row[field]) && !keys.has(keyOf(table, row)))
      .map((row) => {
        const message = `${table} ${keyOf(table, row)} with ${field} ${row[field]} was deleted; a published id stays, so end the row with an event`;
        return report(FrozenKeyError, table, row, field, message);
      });
    return [...changed, ...deleted];
  });
};
