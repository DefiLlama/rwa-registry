/**
 * eventNotes: an undated event says why in a note, and a suspicious review or a retirement gives its reason; a held event only warns.
 * @dev review: src/registry/checks/datedDeployments.ts
 */
import { MissingReasonError, UndatedEventError } from '../../errors';
import { EVENT_KINDS, type Registry, type Row } from '../../schema';
import { keyOf, keySets } from '../keys';
import { report, type Problem } from '../problem';

const needsReason = (event: Row<'event'>) => {
  const rule = EVENT_KINDS[event.kind]?.reason;
  return rule === 'always' || (rule === 'when-suspicious' && event.outcome === 'suspicious');
};

export const eventNotes = (registry: Registry, base: Registry | null): Problem[] => {
  const known = base ? keySets(base).event : null;
  return registry.event.flatMap((event) => {
    const key = keyOf('event', event);
    const severity = !known || known.has(key) ? 'warning' : 'error';
    return [
      ...(event.date == null && !event.note
        ? [report(UndatedEventError, 'event', event, 'note', `${key} has no date and no note saying why`, severity)]
        : []),
      ...(needsReason(event) && !event.reason
        ? [report(MissingReasonError, 'event', event, 'reason', `${key} needs a reason`, severity)]
        : []),
    ];
  });
};
