/**
 * readers: one date reader per chain family, one line each, and the history day for any deployment they leave null.
 * @dev review: src/discover/dateReader.ts
 */
import { familyOf } from '../../registry/chains';
import type { AddressFamily } from '../../schema';
import { groupBy } from '../../utils/groupBy';
import type { DateQuery, DateReader } from '../dateReader';
import { missing, type DateResult } from '../dateResult';
import type { DiscoverDeps } from '../discoverDeps';
import { aptos } from './aptos';
import { evm } from './evm';
import { firstStoredDay } from './history';
import { solana } from './solana';
import { stellar } from './stellar';
import { sui } from './sui';
import { ton } from './ton';
import { tron } from './tron';
import { xrpl } from './xrpl';

export const dateReaders: DateReader[] = [evm, solana, stellar, xrpl, tron, aptos, sui, ton];

const byFamily = new Map<AddressFamily, DateReader>(dateReaders.map((reader) => [reader.family, reader]));

export const readDates = async (queries: DateQuery[], deps: DiscoverDeps): Promise<DateResult[]> => {
  const results = new Map<DateQuery, DateResult>();
  const families = new Map(queries.map((query) => [query, familyOf(query.chain)]));
  await Promise.all(
    [...groupBy(queries, (query) => families.get(query)!)].map(async ([family, group]) => {
      const reader = family && byFamily.get(family);
      const unread = ({ chain }: DateQuery) =>
        family ? missing('no-reader') : missing('unknown-chain', null, { detail: `the sdk does not know ${chain}` });
      const read = reader ? await reader.read(group, deps) : group.map(unread);
      group.forEach((query, index) => results.set(query, read[index]));
    }),
  );
  await Promise.all(
    queries
      .filter((query) => families.get(query) !== null && results.get(query)!.date === null)
      .map(async (query) => {
        const day = await firstStoredDay(query, deps).catch(() => null);
        if (day) results.set(query, day);
      }),
  );
  return queries.map((query) => results.get(query)!);
};
