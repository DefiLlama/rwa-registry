/**
 * delist: a dated delisting event on an asset, market, venue or platform, from which its delisted flag and status follow.
 * @dev review: src/cli/eventCommand.ts
 */
import { reviewFlagsOf } from '../../registry/reviewFlags';
import { defineEventCommand } from '../eventCommand';

export const delist = defineEventCommand({
  name: 'delist',
  description: 'delist an asset, market, venue or platform: set delisted and add a dated delisting event',
  kind: 'delisting',
  state: (events) => (reviewFlagsOf(events).delisted ? 'is already delisted' : null),
});
