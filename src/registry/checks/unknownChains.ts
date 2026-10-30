/**
 * unknownChains: a warning per deployment, platform chain or venue chain on a chain the sdk does not know.
 * @dev review: src/registry/chains.ts, src/registry/checks/addressFormats.ts
 */
import { UnknownChainError } from '../../errors';
import type { Registry, TableName } from '../../schema';
import { familyOf } from '../chains';
import { rowsOf } from '../keys';
import { report, type Problem } from '../problem';

const CHAIN_FIELDS: [table: TableName, field: string][] = [
  ['organization', 'primaryChain'],
  ['organization', 'chains'],
  ['venue', 'chain'],
  ['deployment', 'chain'],
];

export const unknownChains = (registry: Registry): Problem[] =>
  CHAIN_FIELDS.flatMap(([table, field]) =>
    rowsOf(registry, table).flatMap((row) => {
      const value = row[field];
      const values = Array.isArray(value) ? value : [value];
      return values.flatMap((chain, i) => {
        if (chain == null || familyOf(String(chain)) !== null) return [];
        const at = Array.isArray(value) ? `${field}[${i}]` : field;
        const message = `${at} names ${chain}, a chain the sdk does not know; it is listed and nothing is read there`;
        return [report(UnknownChainError, table, row, at, message, 'warning')];
      });
    }),
  );
