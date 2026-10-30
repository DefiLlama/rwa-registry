/**
 * frozenKeys: a published legacy id stays on the row that holds it, so a changed id, a renamed slug or a deleted row fails,
 * unless registry/key-changes.json lists that deletion or move, which then only warns.
 * @dev review: src/registry/checks/uniqueKeys.ts, src/schema/keyChange.ts
 */
import { FrozenKeyError, KeyChangeError } from '../../errors';
import type { FrozenTable, Registry } from '../../schema';
import { keyOf, rowsOf, type AnyRow } from '../keys';
import { report, type Problem } from '../problem';

const FROZEN: Record<FrozenTable, string> = { asset: 'legacyId', organization: 'legacyPid', perp_market: 'legacyId' };

const listedChange = (registry: Registry) => {
  const listed = new Set(registry.key_change.map((row) => `${row.table}|${row.legacyId}|${row.slug}|${row.change}|${row.to ?? ''}`));
  return (table: FrozenTable, legacy: unknown, slug: string, to: string | null) =>
    listed.has(`${table}|${legacy}|${slug}|${to == null ? 'deleted' : 'moved'}|${to ?? ''}`);
};

const DELETED = '; a published id stays, so end the row with an event, or list the deletion in key-changes.json';

const frozen = (table: FrozenTable, row: AnyRow, field: string, message: string, listed: boolean, resolve = ''): Problem =>
  listed
    ? report(KeyChangeError, table, row, field, `${message}, as key-changes.json lists`, 'warning')
    : report(FrozenKeyError, table, row, field, `${message}${resolve}`);

export const frozenKeys = (registry: Registry, base: Registry | null): Problem[] => {
  if (!base) return [];
  const isListed = listedChange(registry);
  return (Object.entries(FROZEN) as [FrozenTable, string][]).flatMap(([table, field]) => {
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
        const message = `${field} ${legacy} moved from ${previous} to ${key}`;
        return [frozen(table, row, field, message, isListed(table, legacy, previous, key))];
      }
      return [];
    });
    const deleted = rowsOf(base, table)
      .filter((row) => row[field] != null && !held.has(row[field]) && !keys.has(keyOf(table, row)))
      .map((row) => {
        const message = `${table} ${keyOf(table, row)} with ${field} ${row[field]} was deleted`;
        return frozen(table, row, field, message, isListed(table, row[field], keyOf(table, row), null), DELETED);
      });
    return [...changed, ...deleted];
  });
};
