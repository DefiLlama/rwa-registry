/**
 * delist: a dated delisting event on an asset, market, venue or platform; its status derives delisted from it.
 * @dev review: src/cli/eventCommand.ts
 */
import { defineEventCommand, latestOf } from '../eventCommand';

export const delist = defineEventCommand({
  name: 'delist',
  description: 'delist an asset, market, venue or platform with a dated event',
  kind: 'delisting',
  state: (events) => (latestOf(events, ['listing', 'delisting'])?.kind === 'delisting' ? 'is already delisted' : null),
});
