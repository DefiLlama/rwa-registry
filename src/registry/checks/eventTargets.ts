/**
 * eventTargets: an event kind sits only on the tables it can change, a split on a market and a maturity on an asset.
 * @dev review: src/registry/deriveFields.ts
 */
import { EventTargetError } from '../../errors';
import { EVENT_KINDS, type Registry } from '../../schema';
import { report, type Problem } from '../problem';

export const eventTargets = (registry: Registry): Problem[] =>
  registry.event
    .filter((row) => row.target && !(EVENT_KINDS[row.kind]?.targets ?? []).includes(row.target.table))
    .map((row) => {
      const allowed = EVENT_KINDS[row.kind]?.targets.join(', ') ?? 'no table';
      const message = `a ${row.kind} event cannot sit on a ${row.target.table}; it targets ${allowed}`;
      return report(EventTargetError, 'event', row, 'kind', message);
    });
