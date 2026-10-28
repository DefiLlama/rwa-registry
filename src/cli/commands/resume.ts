/**
 * resume: a dated resumed event after a pause; a resumed venue publishes again.
 * @dev review: src/cli/commands/pause.ts
 */
import { defineEventCommand, latestOf } from '../eventCommand';

export const resume = defineEventCommand({
  name: 'resume',
  description: 'resume a paused asset, market, venue or platform with a dated event; a venue publishes again',
  kind: 'resumed',
  state: (events) => (latestOf(events, ['paused', 'resumed'])?.kind === 'paused' ? null : 'is not paused'),
  change: (file, target) => (target.table === 'venue' ? { ...file, published: true } : file),
});
