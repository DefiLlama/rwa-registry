/**
 * cycles: wraps, bridgedFrom, venue parent and organization parent never loop back to their row.
 * @dev review: src/registry/checks/references.ts
 */
import { CycleError } from '../../errors';
import type { Registry, TableName } from '../../schema';
import { keyOf, rowsOf, type AnyRow } from '../keys';
import { report, type Problem } from '../problem';

const EDGES: [TableName, string][] = [
  ['asset', 'wraps'],
  ['deployment', 'bridgedFrom'],
  ['venue', 'parent'],
  ['organization', 'parent'],
];

export const cycles = (registry: Registry): Problem[] =>
  EDGES.flatMap(([table, field]) => {
    const rows = new Map(rowsOf(registry, table).map((row) => [keyOf(table, row), row] as [string, AnyRow]));
    const done = new Set<string>();
    const problems: Problem[] = [];
    for (const start of [...rows.keys()].sort()) {
      const path: string[] = [];
      let key: string | undefined = start;
      while (key !== undefined && !done.has(key) && !path.includes(key)) {
        path.push(key);
        const next: unknown = rows.get(key)?.[field];
        key = next == null ? undefined : String(next);
      }
      if (key !== undefined && path.includes(key)) {
        const loop = [...path.slice(path.indexOf(key)), key];
        problems.push(report(CycleError, table, rows.get(key)!, field, `${field} cycle: ${loop.join(' -> ')}`));
      }
      path.forEach((visited) => done.add(visited));
    }
    return problems;
  });
