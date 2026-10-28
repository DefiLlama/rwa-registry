/**
 * discoverReads: the two questions a command asks outside the discover command, the date of new deployments and the listing of a new market, with the deps built on first use.
 * @dev review: src/cli/commands/add-asset.ts, src/cli/commands/add-market.ts
 */
import type { VenueTarget } from './listings/listingReader';
import type { Env } from '../config/loadConfig';
import type { DateQuery } from './dateReader';
import type { DateResult } from './dateResult';
import { buildDiscoverDeps, type DiscoverDeps } from './discoverDeps';
import { readListings } from './listings';
import { readDates } from './readers';

export interface DiscoverReads {
  dates(queries: DateQuery[]): Promise<DateResult[]>;
  listings(targets: VenueTarget[]): Promise<DateResult[]>;
}

export const discoverReads = (env: Env, log: (line: string) => void): DiscoverReads => {
  let deps: DiscoverDeps | undefined;
  const ready = () => (deps ??= buildDiscoverDeps(env, log));
  return {
    dates: (queries) => readDates(queries, ready()),
    listings: (targets) => readListings(targets, ready()),
  };
};
