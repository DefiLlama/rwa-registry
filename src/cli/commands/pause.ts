/**
 * pause: a dated paused event on an asset, market, venue or platform; a paused venue is also unpublished.
 * @dev review: src/cli/eventCommand.ts, then src/cli/commands/resume.ts
 */
import { defineEventCommand, latestOf } from '../eventCommand';

export const pause = defineEventCommand({
  name: 'pause',
  description: 'pause an asset, market, venue or platform with a dated event; a venue stops publishing',
  kind: 'paused',
  state: (events) => (latestOf(events, ['paused', 'resumed'])?.kind === 'paused' ? 'is already paused' : null),
  change: (file, target) => (target.table === 'venue' ? { ...file, published: false } : file),
});
