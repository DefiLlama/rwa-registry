/**
 * paced: at most n reads of one source in flight, a minimum gap between their starts scaled by each read's weight, and the configured retries of a rate-limited read, which hold back the whole source; each pacer counts its calls for the run's summary.
 * @dev review: src/discover/discoverConfig.ts
 */
import { reasonOf, type Reason } from '../errors/reasons';
import { limit } from '../utils/limit';
import type { Pace } from './discoverConfig';

export interface PaceStats {
  calls: number;
  failed: Partial<Record<Reason, number>>;
  // From the first start to the last end, in ms since the epoch; 0 before the first call.
  firstStart: number;
  lastEnd: number;
}

// weight: how many minimum gaps a read takes, such as an Alchemy method that costs twice the compute units.
export type Paced = (<T>(task: () => Promise<T>, weight?: number) => Promise<T>) & { stats: PaceStats };
export type Sleep = (ms: number) => Promise<void>;

export const sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const paced = (
  { concurrency, minIntervalMs }: Pace,
  { retries, retryDelayMs }: { retries: number; retryDelayMs: number },
  wait: Sleep = sleep,
  clock: () => number = Date.now,
): Paced => {
  const limiter = limit(concurrency);
  const stats: PaceStats = { calls: 0, failed: {}, firstStart: 0, lastEnd: 0 };
  let nextStart = 0;
  const slot = async (weight: number) => {
    const now = clock();
    const start = Math.max(now, nextStart);
    nextStart = start + minIntervalMs * weight;
    if (start > now) await wait(start - now);
  };
  const run = <T>(task: () => Promise<T>, weight = 1) =>
    limiter(async () => {
      for (let attempt = 0; ; attempt++) {
        await slot(weight);
        stats.calls++;
        stats.firstStart ||= clock();
        try {
          return await task();
        } catch (error) {
          const reason = reasonOf(error);
          stats.failed[reason] = (stats.failed[reason] ?? 0) + 1;
          // A timeout is never asked again in this run: a slow source answers null and the next run asks.
          if (attempt >= retries || reason !== 'rate-limited') throw error;
          // The limit belongs to the source, so every read of it waits, not only this one.
          nextStart = Math.max(nextStart, clock() + retryDelayMs * (attempt + 1));
        } finally {
          stats.lastEnd = clock();
        }
      }
    });
  return Object.assign(run, { stats });
};
