/**
 * readers: one date reader per chain family, registered one line each; a family with none answers no-reader, and a chain the sdk does not know answers unknown-chain.
 * A deployment no reader dated on a chain the sdk knows then gets the first day DefiLlama stored a value for it, from the history source.
 * @dev review: src/discover/dateReader.ts
 */
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

// No explorer or node answered, a rate limit included: a null with no cursor to resume from.
// A Solana mint that holds a cursor asks the history source itself, before its walk. A failed history read keeps the reader's own null.
const noneAnswered = (result: DateResult) => result.date === null && !result.cursor;

export const readDates = async (queries: DateQuery[], deps: DiscoverDeps): Promise<DateResult[]> => {
  const results = new Map<DateQuery, DateResult>();
  await Promise.all(
    [...groupBy(queries, ({ family }) => family)].map(async ([family, group]) => {
      const reader = family && byFamily.get(family);
      const unread = ({ chain }: DateQuery) =>
        family ? missing('no-reader') : missing('unknown-chain', null, { detail: `the sdk does not know ${chain}` });
      const read = reader ? await reader.read(group, deps) : group.map(unread);
      group.forEach((query, index) => results.set(query, read[index]));
    }),
  );
  await Promise.all(
    queries
      .filter((query) => query.family !== null && noneAnswered(results.get(query)!))
      .map(async (query) => {
        const day = await firstStoredDay(query, deps).catch(() => null);
        if (day) results.set(query, day);
      }),
  );
  return queries.map((query) => results.get(query)!);
};
