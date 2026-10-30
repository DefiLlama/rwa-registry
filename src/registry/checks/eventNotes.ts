/**
 * eventNotes: an undated event holds a note, a link or a reason, and a suspicious review or a retirement gives its reason; both only warn.
 * @dev review: src/registry/checks/datedDeployments.ts
 */
import { MissingReasonError, UndatedEventError } from '../../errors';
import { EVENT_KINDS, type Registry, type Row } from '../../schema';
import { keyOf } from '../keys';
import { report, type Problem } from '../problem';

const needsReason = (event: Row<'event'>) => {
  const rule = EVENT_KINDS[event.kind]?.reason;
  return rule === 'always' || (rule === 'when-suspicious' && event.outcome === 'suspicious');
};

export const eventNotes = (registry: Registry): Problem[] =>
  registry.event.flatMap((event) => {
    const key = keyOf('event', event);
    return [
      ...(event.date == null && !event.note && !event.links?.length && !event.reason
        ? [report(UndatedEventError, 'event', event, 'note', `${key} has no date, no note, no link and no reason`, 'warning')]
        : []),
      ...(needsReason(event) && !event.reason
        ? [report(MissingReasonError, 'event', event, 'reason', `${key} needs a reason`, 'warning')]
        : []),
    ];
  });
