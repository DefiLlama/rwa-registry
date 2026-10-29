/**
 * dateReader: the one shape every chain family's reader has: deployments in, one DateResult each, in order.
 * @dev review: src/discover/readers/index.ts
 */
import type { AddressFamily } from '../schema';
import { missingOf, type DateResult } from './dateResult';
import type { DiscoverDeps } from './discoverDeps';

export interface DateQuery {
  chain: string;
  // The key the sdk's provider is fetched by: the chain key itself, since a chain is a DefiLlama chain key.
  chainId: string;
  family: AddressFamily;
  address: string;
  before?: string | null;
  // The asset a deployment belongs to, for the history source: its legacy id and how many of its deployments share this chain.
  asset?: { legacyId: number; deploymentsOnChain: number };
}

export interface DateReader {
  family: AddressFamily;
  read(queries: DateQuery[], deps: DiscoverDeps): Promise<DateResult[]>;
}

// A reader that asks one address at a time, a failure costing only that address.
export const eachQuery =
  (read: (query: DateQuery, deps: DiscoverDeps) => Promise<DateResult>): DateReader['read'] =>
  (queries, deps) =>
    Promise.all(queries.map((query) => read(query, deps).catch((error: unknown) => missingOf(error))));
