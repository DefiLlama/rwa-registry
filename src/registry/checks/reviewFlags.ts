/**
 * reviewFlags: each row's suspicious and delisted flags equal what its events say, and no event they are read from is dated after the day the registry is checked at, so the flags and the derived status agree.
 * @dev review: src/registry/reviewFlags.ts
 */
import { FutureEventError, ReviewFlagError } from '../../errors';
import type { Registry } from '../../schema';
import { groupBy } from '../../utils/groupBy';
import { keyOf, targetKey } from '../keys';
import { report, type Problem } from '../problem';
import { FLAG_EVENT_KINDS, holdsReviewFlags, REVIEW_FLAG_TABLES, REVIEW_FLAGS, reviewFlagsOf } from '../reviewFlags';

const FLAG_KINDS = Object.values(FLAG_EVENT_KINDS).flat();

const futureEvents = (registry: Registry, day: string): Problem[] =>
  registry.event
    .filter((event) => FLAG_KINDS.includes(event.kind) && event.date != null && event.date > day)
    .map((event) =>
      report(FutureEventError, 'event', event, 'date', `a ${event.kind} event dated ${event.date} is after ${day}`),
    );

export const reviewFlags = (registry: Registry, day: string): Problem[] => {
  const events = groupBy(registry.event, (event) => targetKey(event.target));
  const disagreements = REVIEW_FLAG_TABLES.flatMap((table) =>
    (registry[table] as Record<string, unknown>[]).flatMap((row) => {
      if (!holdsReviewFlags(table, row.kind as string | undefined)) return [];
      const key = keyOf(table, row);
      const expected = reviewFlagsOf(events.get(targetKey({ table, key })) ?? []);
      // The schema already fails a missing flag on an asset, market or venue; a platform's is optional there.
      const unset = (flag: string) => row[flag] == null && table !== 'organization';
      return REVIEW_FLAGS.filter((flag) => !unset(flag) && row[flag] !== expected[flag]).map((flag) =>
        report(ReviewFlagError, table, row, flag, `${key} has ${flag} ${row[flag] ?? 'unset'}; its events say ${expected[flag]}`),
      );
    }),
  );
  return [...disagreements, ...futureEvents(registry, day)];
};
