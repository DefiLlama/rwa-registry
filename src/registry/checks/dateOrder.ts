/**
 * dateOrder: a dated row starts no later than it ends, for roles and acks, and a drift ack's first series day comes no later than its last.
 * @dev review: src/registry/checks/index.ts
 */
import { DateOrderError } from '../../errors';
import type { Registry, TableName } from '../../schema';
import { rowsOf } from '../keys';
import { report, type Problem } from '../problem';

const SPANS: [TableName, from: string, to: string][] = [
  ['role', 'from', 'to'],
  ['ack', 'from', 'until'],
  ['ack', 'firstDay', 'lastDay'],
];

export const dateOrder = (registry: Registry): Problem[] =>
  SPANS.flatMap(([table, from, to]) =>
    rowsOf(registry, table)
      .filter((row) => row[from] != null && row[to] != null && String(row[from]) > String(row[to]))
      .map((row) => report(DateOrderError, table, row, from, `${from} ${row[from]} is after ${to} ${row[to]}`)),
  );
