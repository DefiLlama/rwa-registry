/**
 * identifierSources: an identifier nobody read at its source only warns on a row the base holds, and fails on a new row.
 * @dev review: src/schema/identifier.ts
 */
import { UnverifiedIdentifierError } from '../../errors';
import type { Registry } from '../../schema';
import { keyOf, keySets, rowsOf } from '../keys';
import { report, type Problem } from '../problem';

const HOLDERS = ['organization', 'underlying', 'asset'] as const;

type Identifier = { scheme: string; value: string; source?: string | null; verified: boolean };

export const identifierSources = (registry: Registry, base: Registry | null): Problem[] => {
  const known = base ? keySets(base) : null;
  return HOLDERS.flatMap((table) =>
    rowsOf(registry, table).flatMap((row) => {
      const key = keyOf(table, row);
      const isNew = known !== null && !known[table].has(key);
      return ((row.identifiers as Identifier[] | null | undefined) ?? []).flatMap((item, i) => {
        if (item.verified) return [];
        const what = `${item.scheme} ${item.value} on ${table} ${key}`;
        return isNew
          ? [report(UnverifiedIdentifierError, table, row, `identifiers[${i}]`, `new ${what} needs a source someone read`)]
          : [report(UnverifiedIdentifierError, table, row, `identifiers[${i}]`, `${what} is unverified`, 'warning')];
      });
    }),
  );
};
