/**
 * dateOrder: a dated row starts no later than it ends, for holder labels, roles and acks.
 * @dev review: src/registry/checks/index.ts
 */
import { DateOrderError } from '../../errors';
import type { Registry, TableName } from '../../schema';
import { rowsOf } from '../keys';
import { report, type Problem } from '../problem';

const SPANS: [TableName, from: string, to: string][] = [
  ['address_label', 'from', 'to'],
  ['role', 'from', 'to'],
  ['ack', 'from', 'until'],
];

export const dateOrder = (registry: Registry): Problem[] =>
  SPANS.flatMap(([table, from, to]) =>
    rowsOf(registry, table)
      .filter((row) => row[from] != null && row[to] != null && String(row[from]) > String(row[to]))
      .map((row) => report(DateOrderError, table, row, from, `${from} ${row[from]} is after ${to} ${row[to]}`)),
  );
